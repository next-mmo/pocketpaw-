#!/usr/bin/env bash
# Build FreeCut upstream frontend for PocketPaw extension
# Usage: bash build.sh
#
# This script:
# 1. Clones the FreeCut repo if upstream/ doesn't exist
# 2. Installs upstream npm dependencies (if needed)
# 3. Creates .env with PocketPaw proxy config
# 4. Builds the Vite app and outputs to the extension root

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPSTREAM_DIR="$SCRIPT_DIR/upstream"
EXT_DIR="$SCRIPT_DIR"

# Clone upstream if missing
if [ ! -d "$UPSTREAM_DIR" ]; then
  echo "==> Cloning FreeCut upstream..."
  git clone --depth 1 https://github.com/peopleinfo/freecut.git "$UPSTREAM_DIR"
  rm -rf "$UPSTREAM_DIR/.git"
fi

cd "$UPSTREAM_DIR"

# Create .env for PocketPaw API proxy (if missing)
if [ ! -f ".env" ]; then
  echo "==> Creating .env with PocketPaw proxy config..."
  cat > .env << 'EOF'
# FreeCut → PocketPaw overrides
VITE_API_BASE=/api/v1/plugins/freecut/proxy/api
EOF
fi

# Install deps if node_modules missing
if [ ! -d "node_modules" ]; then
  echo "==> Installing npm dependencies..."
  npm install
fi

# Build with relative base for iframe loading
echo "==> Building FreeCut frontend..."
npx vite build --base ./ --outDir "$EXT_DIR" --emptyOutDir false

echo "==> Build complete!"
echo "    index.html + assets/ written to $EXT_DIR"
