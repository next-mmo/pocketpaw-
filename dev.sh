#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Kill any process holding port 8888 (cross-platform)
if command -v lsof &>/dev/null; then
  lsof -ti :8888 | xargs kill -9 2>/dev/null || true
else
  # Windows (Git Bash / MINGW64): use netstat + taskkill
  netstat -ano 2>/dev/null \
    | grep ':8888 .*LISTENING' \
    | awk '{print $NF}' \
    | sort -u \
    | while read -r pid; do
        taskkill //F //PID "$pid" 2>/dev/null || true
      done
fi

uv run pocketpaw --dev
