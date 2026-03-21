"""System status tool."""

import platform
from datetime import UTC, datetime, timedelta


def get_system_status_snapshot() -> dict:
    """Return structured system metrics for UI clients and API callers."""
    system = platform.system()
    machine = platform.machine()
    snapshot = {
        "available": True,
        "limited": False,
        "platform": system,
        "machine": machine,
        "label": f"{system} ({machine})",
        "cpu": {"percent": None, "cores": None},
        "memory": {"percent": None, "used_gb": None, "total_gb": None},
        "disk": {"percent": None, "used_gb": None, "total_gb": None},
        "battery": None,
        "uptime": "",
    }

    try:
        import psutil
    except ImportError:
        snapshot["limited"] = True
        snapshot["available"] = False
        snapshot["message"] = "Install psutil for full system metrics."
        return snapshot

    # CPU - use interval=0 to avoid blocking (uses cached value)
    cpu_percent = psutil.cpu_percent(interval=0)
    cpu_count = psutil.cpu_count()

    # Memory
    mem = psutil.virtual_memory()
    mem_used_gb = mem.used / (1024**3)
    mem_total_gb = mem.total / (1024**3)

    # Disk
    disk = psutil.disk_usage("/")
    disk_used_gb = disk.used / (1024**3)
    disk_total_gb = disk.total / (1024**3)

    # Uptime
    boot_time = datetime.fromtimestamp(psutil.boot_time(), tz=UTC)
    uptime = datetime.now(tz=UTC) - boot_time
    uptime_str = str(timedelta(seconds=int(uptime.total_seconds())))

    snapshot["cpu"] = {
        "percent": round(cpu_percent, 1),
        "cores": cpu_count,
    }
    snapshot["memory"] = {
        "percent": round(mem.percent, 1),
        "used_gb": round(mem_used_gb, 1),
        "total_gb": round(mem_total_gb, 1),
    }
    snapshot["disk"] = {
        "percent": round(disk.percent, 1),
        "used_gb": round(disk_used_gb, 1),
        "total_gb": round(disk_total_gb, 1),
    }
    snapshot["uptime"] = uptime_str

    try:
        battery = psutil.sensors_battery()
        if battery:
            snapshot["battery"] = {
                "percent": round(battery.percent, 1),
                "power_plugged": bool(battery.power_plugged),
            }
    except Exception:
        snapshot["battery"] = None

    return snapshot


def get_system_status() -> str:
    """Get formatted system status."""
    snapshot = get_system_status_snapshot()

    if snapshot.get("limited"):
        return (
            f"🟡 **System Status (limited)**\n\n"
            f"💻 **{snapshot['label']}**\n\n"
            f"Install psutil for full stats: pip install 'pocketpaw[desktop]'"
        )

    cpu = snapshot["cpu"]
    memory = snapshot["memory"]
    disk = snapshot["disk"]
    battery = snapshot.get("battery")

    battery_str = ""
    if battery:
        battery_str = f"\n🔋 Battery: {battery['percent']:.0f}%"
        if battery["power_plugged"]:
            battery_str += " ⚡"

    return f"""🟢 **System Status**

💻 **{snapshot['label']}**

🧠 CPU: {cpu['percent']:.1f}% ({cpu['cores']} cores)
💾 RAM: {memory['used_gb']:.1f} / {memory['total_gb']:.1f} GB ({memory['percent']:.0f}%)
💿 Disk: {disk['used_gb']:.0f} / {disk['total_gb']:.0f} GB ({disk['percent']:.0f}%){battery_str}
⏱️ Uptime: {snapshot['uptime']}
"""
