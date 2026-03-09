#!/usr/bin/env bash
# Build FreeCut upstream frontend for PocketPaw extension
# Usage: bash build.sh
#
# This script:
# 1. Installs upstream npm dependencies (if needed)
# 2. Builds the Vite app with .env.production (sets VITE_API_URL to PocketPaw proxy)
# 3. Outputs index.html + assets/ to the extension root

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPSTREAM_DIR="$SCRIPT_DIR/upstream"
EXT_DIR="$SCRIPT_DIR"

echo "==> Building FreeCut frontend for PocketPaw..."

cd "$UPSTREAM_DIR"

# Install deps if node_modules missing
if [ ! -d "node_modules" ]; then
  echo "==> Installing npm dependencies..."
  npm install
fi

# Build with relative base for iframe loading
# .env.production sets VITE_API_URL=/api/v1/plugins/freecut/proxy
npx vite build --base ./ --outDir "$EXT_DIR" --emptyOutDir false

echo "==> Build complete!"
echo "    index.html + assets/ written to $EXT_DIR"
