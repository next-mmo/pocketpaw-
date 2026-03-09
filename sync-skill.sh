#!/usr/bin/env bash
# ============================================
# sync-skills.sh — Install local skills to your IDE
# ============================================
#
# Usage:
#   bash scripts/sync-skills.sh              # Install skills/ → your IDE
#   bash scripts/sync-skills.sh --pull       # Pull remote → skills/ first, then install
#   bash scripts/sync-skills.sh --list       # List local skills
#
# Uses Vercel's npx skills CLI for IDE selection.
# See: https://github.com/vercel-labs/skills
# ============================================

set -euo pipefail

REMOTE_REPO="besoeasy/open-skills"
LOCAL_SKILLS_DIR="skills"

# Parse args
MODE="sync"
EXTRA_FLAGS=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --list)   MODE="list"; shift ;;
    --pull)   MODE="pull"; shift ;;
    -y|--yes) EXTRA_FLAGS="$EXTRA_FLAGS -y"; shift ;;
    *)        shift ;;
  esac
done

# ── List ───────────────────────────────────────────────────
if [ "$MODE" = "list" ]; then
  echo "📌 Local skills (in $LOCAL_SKILLS_DIR/):"
  for d in "$LOCAL_SKILLS_DIR"/*/; do
    [ -f "$d/SKILL.md" ] && echo "  • $(basename "$d")"
  done 2>/dev/null
  exit 0
fi

# ── Pull: remote → skills/ then install ────────────────────
if [ "$MODE" = "pull" ]; then
  echo "🔄 Pulling remote skills from $REMOTE_REPO → $LOCAL_SKILLS_DIR/..."
  echo ""
  npx -y skills add "$REMOTE_REPO" --skill '*' $EXTRA_FLAGS
  echo ""
fi

# ── Sync: skills/ → IDE ───────────────────────────────────
if [ ! -d "$LOCAL_SKILLS_DIR" ] || [ -z "$(ls -A "$LOCAL_SKILLS_DIR" 2>/dev/null)" ]; then
  echo "❌ No skills found in $LOCAL_SKILLS_DIR/"
  echo "   Add skills manually or run: npm run skills:pull"
  exit 1
fi

echo "📌 Installing local skills from $LOCAL_SKILLS_DIR/ → your IDE..."
echo ""
npx -y skills add "./$LOCAL_SKILLS_DIR" --skill '*' $EXTRA_FLAGS

echo ""
echo "✅ Done!"