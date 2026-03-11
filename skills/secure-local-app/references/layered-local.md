# Pattern C: Layered Local Protection

Best for: Fully offline apps, CLI tools, utilities where server dependency is not
practical or desired. This is the weakest pattern but still effective against casual piracy.

## Strategy: Make It Not Worth the Effort

Since everything runs locally, you can't make cracking impossible — you make it
annoying and time-consuming enough that most people just buy a license instead.

## Layer Stack

```
┌────────────────────────────────────────────────┐
│ Layer 5: Telemetry (detect anomalies)          │
├────────────────────────────────────────────────┤
│ Layer 4: Integrity checks (detect tampering)   │
├────────────────────────────────────────────────┤
│ Layer 3: Hardware fingerprint (prevent sharing)│
├────────────────────────────────────────────────┤
│ Layer 2: License validation (block casual use) │
├────────────────────────────────────────────────┤
│ Layer 1: Code hardening (prevent reading code) │
└────────────────────────────────────────────────┘
```

## Layer 1: Code Hardening with Nuitka

```bash
# Install
pip install nuitka

# Basic compilation (good)
python -m nuitka --standalone --onefile your_app.py

# Better compilation (recommended)
python -m nuitka \
  --standalone \
  --onefile \
  --enable-plugin=anti-bloat \
  --nofollow-import-to=pytest,unittest,test \
  --output-filename=your-app \
  --company-name="Your Company" \
  --product-name="Your App" \
  --file-version=1.0.0 \
  --include-data-dir=./assets=assets \
  your_app.py

# Nuitka Commercial (if budget allows)
# Adds: code encryption, symbol removal, anti-debugging
python -m nuitka \
  --standalone \
  --onefile \
  --commercial \
  --encryption-key=YOUR_KEY \
  your_app.py
```

For Electron JS:

```bash
# Compile JS to V8 bytecode
npm install bytenode

# In build script:
const bytenode = require('bytenode');
bytenode.compileFile('main.js', 'main.jsc');
```

## Layer 2: License Key Validation

### Using Keygen (recommended — free tier available)

```python
# license_manager.py
import hashlib
import json
import os
import time
from pathlib import Path

import httpx

KEYGEN_ACCOUNT = "your-account-id"
KEYGEN_API = f"https://api.keygen.sh/v1/accounts/{KEYGEN_ACCOUNT}"
LICENSE_CACHE = Path.home() / ".yourapp" / "license.dat"


class LicenseManager:
    def __init__(self):
        self.license_key = None
        self.valid = False
        self.cached_validation = None

    def activate(self, key: str) -> dict:
        """Activate a license key with hardware fingerprint."""
        fingerprint = self._get_machine_fingerprint()

        resp = httpx.post(
            f"{KEYGEN_API}/licenses/{key}/actions/validate",
            json={
                "meta": {
                    "scope": {"fingerprint": fingerprint}
                }
            },
            headers={"Accept": "application/json"},
        )

        data = resp.json()

        if data.get("meta", {}).get("valid"):
            self.license_key = key
            self.valid = True
            self._cache_validation(data)
            return {"status": "activated", "plan": data["data"]["attributes"]["metadata"].get("plan")}

        # If not valid, might need machine activation
        if data.get("meta", {}).get("code") == "FINGERPRINT_SCOPE_MISMATCH":
            return self._activate_machine(key, fingerprint)

        return {"status": "invalid", "reason": data.get("meta", {}).get("detail")}

    def check(self) -> bool:
        """Check if license is valid (with offline cache)."""
        # Try online validation first
        try:
            return self._validate_online()
        except httpx.ConnectError:
            # Offline — check cache
            return self._validate_cached()

    def _get_machine_fingerprint(self) -> str:
        """Generate unique machine identifier."""
        import platform
        import uuid

        components = [
            platform.node(),
            str(uuid.getnode()),  # MAC address
            platform.processor(),
            platform.machine(),
        ]
        raw = "|".join(components)
        return hashlib.sha256(raw.encode()).hexdigest()

    def _cache_validation(self, data: dict):
        """Cache validation result for offline use."""
        cache = {
            "key": self.license_key,
            "valid": True,
            "timestamp": time.time(),
            "fingerprint": self._get_machine_fingerprint(),
            "plan": data["data"]["attributes"]["metadata"].get("plan"),
        }
        LICENSE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        # Encrypt before saving (basic protection)
        encrypted = self._encrypt_cache(json.dumps(cache))
        LICENSE_CACHE.write_bytes(encrypted)

    def _validate_cached(self) -> bool:
        """Validate from cached data (offline grace period: 7 days)."""
        if not LICENSE_CACHE.exists():
            return False

        try:
            decrypted = self._decrypt_cache(LICENSE_CACHE.read_bytes())
            cache = json.loads(decrypted)

            # Check fingerprint matches
            if cache["fingerprint"] != self._get_machine_fingerprint():
                return False

            # Check grace period (7 days)
            age_days = (time.time() - cache["timestamp"]) / 86400
            if age_days > 7:
                return False

            return cache["valid"]
        except Exception:
            return False
```

### DIY License Keys (simpler, less secure)

```python
# Simple signed license key system
import hmac
import hashlib
import base64
import time

LICENSE_SECRET = b"your-secret-key"  # compiled into Nuitka binary

def generate_license(email: str, plan: str, expires_timestamp: int) -> str:
    """Generate on YOUR server, not in the app."""
    payload = f"{email}|{plan}|{expires_timestamp}"
    signature = hmac.new(LICENSE_SECRET, payload.encode(), hashlib.sha256).digest()
    token = base64.urlsafe_b64encode(f"{payload}|{base64.b64encode(signature).decode()}".encode())
    return token.decode()


def validate_license(token: str) -> dict:
    """Validate in the app (compiled with Nuitka)."""
    try:
        decoded = base64.urlsafe_b64decode(token).decode()
        parts = decoded.rsplit("|", 1)
        payload, sig_b64 = parts[0], parts[1]

        # Verify signature
        expected_sig = hmac.new(LICENSE_SECRET, payload.encode(), hashlib.sha256).digest()
        actual_sig = base64.b64decode(sig_b64)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return {"valid": False, "reason": "invalid signature"}

        # Parse payload
        email, plan, expires = payload.split("|")

        if int(expires) < time.time():
            return {"valid": False, "reason": "expired"}

        return {"valid": True, "email": email, "plan": plan}
    except Exception:
        return {"valid": False, "reason": "malformed"}
```

## Layer 3: Hardware Fingerprinting

```python
# fingerprint.py
import hashlib
import platform
import subprocess
import uuid


def get_machine_id() -> str:
    """Cross-platform machine fingerprint."""
    components = []

    # MAC address
    components.append(str(uuid.getnode()))

    # Platform info
    components.append(platform.node())
    components.append(platform.machine())
    components.append(platform.processor())

    # OS-specific hardware IDs
    try:
        system = platform.system()
        if system == "Windows":
            # Windows: motherboard serial
            result = subprocess.run(
                ["wmic", "baseboard", "get", "serialnumber"],
                capture_output=True, text=True
            )
            components.append(result.stdout.strip())
        elif system == "Linux":
            # Linux: machine-id
            with open("/etc/machine-id") as f:
                components.append(f.read().strip())
        elif system == "Darwin":
            # macOS: hardware UUID
            result = subprocess.run(
                ["system_profiler", "SPHardwareDataType"],
                capture_output=True, text=True
            )
            for line in result.stdout.split("\n"):
                if "UUID" in line:
                    components.append(line.split(":")[-1].strip())
    except Exception:
        pass  # graceful fallback

    raw = "|".join(components)
    return hashlib.sha256(raw.encode()).hexdigest()
```

## Layer 4: Integrity Checks

```python
# integrity.py
import hashlib
import sys
import os


def verify_integrity():
    """Check that the binary hasn't been modified."""
    if getattr(sys, 'frozen', False):
        # Running as compiled binary
        exe_path = sys.executable
    else:
        exe_path = __file__

    # Calculate hash of own binary
    sha256 = hashlib.sha256()
    with open(exe_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)

    current_hash = sha256.hexdigest()

    # Compare against known good hash
    # (embedded during build or fetched from server)
    expected_hash = get_expected_hash()

    if current_hash != expected_hash:
        # Binary has been modified — possible tampering
        handle_tamper_detected()


def handle_tamper_detected():
    """React to detected tampering — be subtle, not obvious."""
    # Option 1: Silently degrade (harder for crackers to find the check)
    # Don't show "TAMPERED!" — just quietly break things
    import random
    if random.random() < 0.3:  # Only sometimes, to confuse attackers
        # Introduce subtle bugs in output
        pass

    # Option 2: Log to server (if online)
    try:
        import httpx
        httpx.post("https://yourapi.com/telemetry/integrity", json={
            "event": "integrity_failure",
            "machine": get_machine_id(),
        }, timeout=2)
    except Exception:
        pass
```

## Layer 5: Telemetry

```python
# telemetry.py (anonymous, privacy-respecting)
import httpx
from fingerprint import get_machine_id

TELEMETRY_ENDPOINT = "https://yourapi.com/telemetry"

def report_launch():
    """Anonymous launch telemetry — detect suspicious patterns."""
    try:
        httpx.post(f"{TELEMETRY_ENDPOINT}/launch", json={
            "machine_hash": get_machine_id()[:16],  # truncated for privacy
            "version": APP_VERSION,
            "os": platform.system(),
        }, timeout=2)
    except Exception:
        pass  # never block app for telemetry


# SERVER SIDE: Detect anomalies
# - Same license key on 100+ machines = shared/cracked
# - Spike in activations from one region = keygen published
# - Integrity failures = modified binary circulating
```

## Combining All Layers

```python
# app.py — startup sequence
def main():
    # Layer 1: Already handled by Nuitka compilation

    # Layer 4: Check binary integrity (subtle, non-blocking)
    threading.Thread(target=verify_integrity, daemon=True).start()

    # Layer 5: Anonymous telemetry
    threading.Thread(target=report_launch, daemon=True).start()

    # Layer 2 + 3: License check with hardware fingerprint
    license_mgr = LicenseManager()

    if not license_mgr.check():
        show_activation_dialog()
        key = get_user_input()
        result = license_mgr.activate(key)

        if result["status"] != "activated":
            show_error(result["reason"])
            sys.exit(1)

    # App is licensed — run normally
    run_app()
```

## Limitations of This Pattern

Be honest with yourself:

- A skilled reverse engineer WILL crack this given enough time
- The goal is to make cracking take hours/days, not minutes
- Most pirates will just buy if the price is fair and the product is good
- Focus energy on making a great product, not unbreakable DRM
