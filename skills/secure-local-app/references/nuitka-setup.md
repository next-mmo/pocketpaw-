# Nuitka Setup Guide

Step-by-step guide to compile Python applications with Nuitka.

## Prerequisites

```bash
# Python 3.7+ required
python --version

# Install Nuitka
pip install nuitka

# C compiler required:
# Windows: Install Visual Studio Build Tools or MinGW
# macOS:   xcode-select --install
# Linux:   sudo apt install gcc g++ (Ubuntu/Debian)
#          sudo dnf install gcc gcc-c++ (Fedora)
```

## Basic Compilation

```bash
# Simple single-file app
python -m nuitka --onefile your_app.py

# Standalone (folder with all dependencies)
python -m nuitka --standalone your_app.py

# Standalone + single file
python -m nuitka --standalone --onefile your_app.py
```

## Recommended Production Build

```bash
python -m nuitka \
  --standalone \
  --onefile \
  --enable-plugin=anti-bloat \
  --nofollow-import-to=pytest,unittest,test,setuptools,pip \
  --remove-output \
  --assume-yes-for-downloads \
  --output-filename=myapp \
  --company-name="Your Company" \
  --product-name="Your App" \
  --product-version=1.0.0 \
  --file-description="Your App Description" \
  --copyright="Copyright 2025 Your Company" \
  --include-data-dir=./assets=assets \
  --include-data-files=./config.json=config.json \
  your_app.py
```

## FastAPI-Specific Build

```bash
# FastAPI has several dependencies to handle
python -m nuitka \
  --standalone \
  --onefile \
  --enable-plugin=anti-bloat \
  --include-package=uvicorn \
  --include-package=fastapi \
  --include-package=starlette \
  --include-package=pydantic \
  --include-package=anyio \
  --include-data-dir=./static=static \
  --include-data-dir=./templates=templates \
  --output-filename=api-server \
  main.py
```

## Common Issues and Fixes

### Missing modules
```bash
# If you get import errors, explicitly include packages:
--include-package=package_name
--include-module=module_name
```

### Data files not found
```bash
# Include data directories:
--include-data-dir=./data=data

# Include specific files:
--include-data-files=./config.yaml=config.yaml

# Access data at runtime:
import os
if getattr(sys, 'frozen', False):
    base_dir = os.path.dirname(sys.executable)
else:
    base_dir = os.path.dirname(__file__)
data_path = os.path.join(base_dir, 'data', 'file.json')
```

### Build takes too long
```bash
# Use C cache to speed up rebuilds:
--ccache

# Limit parallel jobs if running out of memory:
--jobs=2
```

### Windows-specific
```bash
# Hide console window (for GUI apps):
--windows-disable-console

# Add icon:
--windows-icon-from-ico=icon.ico

# Request admin privileges (if needed):
--windows-uac-admin
```

### macOS-specific
```bash
# Create .app bundle:
--macos-create-app-bundle

# Add icon:
--macos-app-icon=icon.icns

# Sign for distribution:
--macos-sign-identity="Developer ID Application: Your Name"
```

## Nuitka Free vs Commercial

| Feature | Free | Commercial |
|---------|------|-----------|
| C compilation | ✅ | ✅ |
| Standalone builds | ✅ | ✅ |
| Onefile builds | ✅ | ✅ |
| Anti-bloat plugin | ✅ | ✅ |
| **Code encryption** | ❌ | ✅ |
| **Symbol hiding** | ❌ | ✅ |
| **Anti-debugging** | ❌ | ✅ |
| **Data file embedding** | Basic | Advanced |
| **Obfuscation** | ❌ | ✅ |

## Build Script Template

```python
#!/usr/bin/env python3
# build.py — Automated build script
import subprocess
import sys
import platform

APP_NAME = "myapp"
VERSION = "1.0.0"
ENTRY = "main.py"

cmd = [
    sys.executable, "-m", "nuitka",
    "--standalone",
    "--onefile",
    "--enable-plugin=anti-bloat",
    "--assume-yes-for-downloads",
    f"--output-filename={APP_NAME}",
    f"--product-version={VERSION}",
    f"--company-name=Your Company",
    f"--product-name={APP_NAME}",
]

# Platform-specific
if platform.system() == "Windows":
    cmd.extend([
        "--windows-disable-console",
        "--windows-icon-from-ico=assets/icon.ico",
    ])
elif platform.system() == "Darwin":
    cmd.extend([
        "--macos-create-app-bundle",
        "--macos-app-icon=assets/icon.icns",
    ])

# Data files
cmd.extend([
    "--include-data-dir=./assets=assets",
])

# Excluded modules (reduce binary size)
cmd.extend([
    "--nofollow-import-to=pytest,unittest,test,setuptools,pip,tkinter",
])

cmd.append(ENTRY)

print(f"Building {APP_NAME} v{VERSION}...")
print(f"Command: {' '.join(cmd)}")
subprocess.run(cmd, check=True)
print("Build complete!")
```

## Integration with Electron

If your app has both Python (FastAPI) and Electron:

```
your-app/
├── electron/          # Electron frontend
│   ├── main.js        # → compile with bytenode
│   ├── renderer.js
│   └── package.json
├── python/            # Python backend
│   ├── main.py        # → compile with Nuitka
│   ├── api/
│   └── requirements.txt
└── build.py           # Builds both
```

```python
# build.py
import subprocess
import platform

# Step 1: Compile Python backend
subprocess.run([
    "python", "-m", "nuitka",
    "--standalone", "--onefile",
    "--output-filename=backend",
    "python/main.py"
], check=True)

# Step 2: Compile Electron JS with bytenode
subprocess.run([
    "npx", "bytenode", "-c", "electron/main.js"
], check=True)

# Step 3: Package Electron app
subprocess.run([
    "npx", "electron-builder", "--config", "electron-builder.yml"
], check=True)
```

Electron launches the compiled Python binary as a child process:

```javascript
// electron/main.js
const { spawn } = require('child_process');
const path = require('path');

function startBackend() {
  const backendPath = path.join(
    process.resourcesPath, 'backend',
    process.platform === 'win32' ? 'backend.exe' : 'backend'
  );

  const backend = spawn(backendPath, ['--port', '8080']);

  backend.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
  });

  return backend;
}
```
