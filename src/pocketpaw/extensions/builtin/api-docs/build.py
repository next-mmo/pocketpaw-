"""Download Swagger UI vendor files for the API Docs extension.

Usage: python build.py

Downloads swagger-ui-bundle.js and swagger-ui.css from unpkg CDN.
These files are gitignored since they're ~1.5 MB of vendor code.
"""

import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
VERSION = "5.18.2"

FILES = {
    "swagger-ui-bundle.js": f"https://unpkg.com/swagger-ui-dist@{VERSION}/swagger-ui-bundle.js",
    "swagger-ui.css": f"https://unpkg.com/swagger-ui-dist@{VERSION}/swagger-ui.css",
}


def main() -> None:
    for name, url in FILES.items():
        dest = SCRIPT_DIR / name
        if dest.exists():
            print(f"  ✓ {name} already exists, skipping", flush=True)
            continue
        print(f"==> Downloading {name} ...", flush=True)
        urllib.request.urlretrieve(url, dest)
        size_kb = dest.stat().st_size // 1024
        print(f"  ✓ {name} ({size_kb} KB)", flush=True)

    print("==> Build complete!", flush=True)


if __name__ == "__main__":
    main()
