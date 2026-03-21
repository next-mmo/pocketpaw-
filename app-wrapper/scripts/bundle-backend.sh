#!/usr/bin/env bash
# ----------------------------------------------------------------
# PocketPaw Desktop - Bundle Backend
#
# Builds the PocketPaw wheel and downloads the standalone uv binary,
# staging both into app-wrapper/resources/backend/ for distribution.
#
# Usage:
#   bash scripts/bundle-backend.sh              # Auto-detect platform
#   bash scripts/bundle-backend.sh --platform win
# ----------------------------------------------------------------
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_WRAPPER="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$APP_WRAPPER")"
BACKEND_DIR="$APP_WRAPPER/resources/backend"
UV_DIR="$BACKEND_DIR/uv"

# UV Release Config
UV_VERSION="0.6.12"
UV_BASE_URL="https://github.com/astral-sh/uv/releases/download/$UV_VERSION"

# Parse args
PLATFORM=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --platform) PLATFORM="$2"; shift 2 ;;
        *) shift ;;
    esac
done

# Auto-detect platform
if [ -z "$PLATFORM" ]; then
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*|Windows*) PLATFORM="win" ;;
        Darwin)
            if [ "$(uname -m)" = "arm64" ]; then
                PLATFORM="mac"
            else
                PLATFORM="mac-x86"
            fi
            ;;
        *) PLATFORM="linux" ;;
    esac
fi

echo ""
echo "  [BUILD] Bundling PocketPaw backend for: $PLATFORM"
echo "  [DIR]   Output: $BACKEND_DIR"
echo ""

# --- Step 0: Clean old artifacts ---
echo "  [CLEAN] Removing old artifacts..."
find "$BACKEND_DIR" -mindepth 1 ! -name '.gitignore' -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$BACKEND_DIR"

# --- Step 1: Build wheel ---
echo "  [WHEEL] Building wheel..."

# Find uv binary
UV_CMD=""
if command -v uv &>/dev/null; then
    UV_CMD="uv"
elif [ -f "$HOME/.local/bin/uv" ] || [ -f "$HOME/.local/bin/uv.exe" ]; then
    UV_CMD="$HOME/.local/bin/uv"
elif [ -f "$HOME/.cargo/bin/uv" ]; then
    UV_CMD="$HOME/.cargo/bin/uv"
fi

BUILD_OK=false
if [ -n "$UV_CMD" ]; then
    echo "  [INFO]  Using uv: $UV_CMD"
    if "$UV_CMD" build --wheel --out-dir "$BACKEND_DIR" --directory "$PROJECT_ROOT"; then
        BUILD_OK=true
    else
        echo "  [WARN]  uv build failed, trying python -m build..."
    fi
else
    echo "  [WARN]  uv not found, trying python -m build..."
fi

if [ "$BUILD_OK" = false ]; then
    if python -m build --wheel --outdir "$BACKEND_DIR" "$PROJECT_ROOT" 2>&1; then
        BUILD_OK=true
    else
        echo "  [FAIL]  Could not build wheel. Install uv or python-build."
        exit 1
    fi
fi

# Find the wheel
WHEEL=$(ls -t "$BACKEND_DIR"/pocketpaw-*.whl 2>/dev/null | head -1)
if [ -z "$WHEEL" ]; then
    echo "  [FAIL]  No wheel file produced!"
    exit 1
fi

# Remove older wheels
for f in "$BACKEND_DIR"/pocketpaw-*.whl; do
    [ "$f" != "$WHEEL" ] && rm -f "$f"
done

WHEEL_SIZE=$(du -h "$WHEEL" | cut -f1)
echo "  [OK]    Wheel: $(basename "$WHEEL") ($WHEEL_SIZE)"

# --- Step 2: Download uv binary ---
echo "  [DL]    Downloading uv $UV_VERSION for $PLATFORM..."

case "$PLATFORM" in
    win)     ARCHIVE="uv-x86_64-pc-windows-msvc.zip";       BIN_PATH="uv-x86_64-pc-windows-msvc/uv.exe" ;;
    mac)     ARCHIVE="uv-aarch64-apple-darwin.tar.gz";      BIN_PATH="uv-aarch64-apple-darwin/uv" ;;
    mac-x86) ARCHIVE="uv-x86_64-apple-darwin.tar.gz";      BIN_PATH="uv-x86_64-apple-darwin/uv" ;;
    linux)   ARCHIVE="uv-x86_64-unknown-linux-musl.tar.gz"; BIN_PATH="uv-x86_64-unknown-linux-musl/uv" ;;
    *)       echo "  [FAIL]  Unknown platform: $PLATFORM"; exit 1 ;;
esac

DOWNLOAD_URL="$UV_BASE_URL/$ARCHIVE"
TEMP_FILE="/tmp/uv-download-$ARCHIVE"

echo "          $DOWNLOAD_URL"
curl -fSL "$DOWNLOAD_URL" -o "$TEMP_FILE"

mkdir -p "$UV_DIR"
EXTRACT_DIR="/tmp/uv-extract-$$"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"

if [[ "$ARCHIVE" == *.zip ]]; then
    unzip -q "$TEMP_FILE" -d "$EXTRACT_DIR"
else
    tar -xzf "$TEMP_FILE" -C "$EXTRACT_DIR"
fi

BIN_NAME="$(basename "$BIN_PATH")"
cp "$EXTRACT_DIR/$BIN_PATH" "$UV_DIR/$BIN_NAME"
chmod +x "$UV_DIR/$BIN_NAME" 2>/dev/null || true

rm -rf "$EXTRACT_DIR" "$TEMP_FILE"

UV_SIZE=$(du -h "$UV_DIR/$BIN_NAME" | cut -f1)
echo "  [OK]    uv binary: $UV_DIR/$BIN_NAME ($UV_SIZE)"

# --- Summary ---
echo ""
echo "  [DONE]  Backend bundle ready!"
echo "          Wheel: $(basename "$WHEEL")"
echo "          UV:    $UV_DIR/$BIN_NAME"
echo "          Dir:   $BACKEND_DIR"
echo ""
echo "  Next: npm run release:win (or :mac / :linux)"
echo ""
