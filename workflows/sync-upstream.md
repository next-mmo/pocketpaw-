---
description: Safely merge upstream changes without losing ANY local customizations across the entire codebase
---

# Safe Upstream Sync (Full Codebase)

This workflow merges `upstream/main` into the local fork while protecting **all** local
customizations — frontend, backend, extensions, config, docs, skills, and everything else.
The goal is to keep **both** our changes and theirs, resolving conflicts in favor of
preserving our custom code while still pulling in upstream improvements.

// turbo-all

## Pre-flight

0. **Make sure the working tree is clean**
   ```bash
   git status --short
   ```
   If there are uncommitted changes, commit or stash them first:
   ```bash
   git add -A && git commit -m "wip: snapshot before upstream sync"
   ```

## Steps

1. **Fetch upstream**
   ```bash
   git fetch upstream
   ```

2. **Check how many commits are ahead**
   ```bash
   git log --oneline HEAD..upstream/main | head -30
   ```
   If there are no new commits, stop here — already up to date.

3. **See which files upstream changed** (to anticipate conflicts)
   ```bash
   git diff --stat HEAD...upstream/main | tail -20
   ```

4. **Create a backup branch** (safety net — can always return here)
   ```bash
   git branch backup/pre-sync-$(date +%Y%m%d-%H%M%S)
   ```

5. **Merge upstream using `ours` strategy for conflicts**
   We merge normally but if there are conflicts, we default to keeping our version.
   This ensures we never silently lose local customizations.
   ```bash
   git merge upstream/main --no-edit
   ```
   - If the merge completes cleanly (no conflicts), skip to step 8.
   - If there are conflicts, continue to step 6.

6. **List ALL conflicting files**
   ```bash
   git diff --name-only --diff-filter=U
   ```
   This lists every file with unresolved conflicts across the entire project — not just frontend.

7. **Resolve conflicts per category**

   For each conflicting file, follow the appropriate strategy:

   ### Frontend (`src/pocketpaw/frontend/`)
   - **Our customizations to keep**: dark mode, quick chat UI, composer assist, /todo integration, sidebar mods
   - **Strategy**: Keep our version for UI files, accept upstream for new features we don't have yet
   - Key files: `templates/base.html`, `templates/components/chat.html`, `templates/components/sidebar.html`, `templates/components/extensions.html`, `js/extensions-sdk.js`, `js/features/extensions.js`, `js/websocket.js`

   ### Backend Python (`src/pocketpaw/*.py`)
   - **Our customizations to keep**: CSP headers (blob:, frame-ancestors), extension proxy routes, dashboard customizations
   - **Strategy**: Keep our additions, accept upstream bugfixes/new endpoints
   - Key files: `dashboard.py`, `web_server.py`, `config.py`, `dashboard_ws.py`, `dashboard_channels.py`

   ### Extensions (`src/pocketpaw/extensions/`)
   - **Our customizations to keep**: builtin extension configs, custom extensions, sandbox settings
   - **Strategy**: Keep our extension.json changes, accept upstream framework improvements
   - Key files: `registry.py`, `manager.py`, `builtin/*/extension.json`

   ### Agent Backends (`src/pocketpaw/agents/`)
   - **Our customizations to keep**: codex_cli key handling, custom backend configs
   - **Strategy**: Keep our fixes, accept upstream new backends

   ### Security (`src/pocketpaw/security/`)
   - **Strategy**: Accept upstream security fixes, keep our additional rails if any

   ### Config & Project Root
   - `pyproject.toml` — Accept upstream dependency bumps, keep our custom deps
   - `AGENTS.md`, `CLAUDE.md` — Keep ours (these are our agent instructions)
   - `dev.sh` — Keep ours
   - `docker-compose.yml`, `Dockerfile` — Merge carefully, keep our env customizations

   ### Docs (`docs/`)
   - `docs-config.json` — Accept upstream nav structure, add our custom entries on top
   - Guide files — Accept upstream, keep our additions

   ### Skills & Workflows
   - `skills/`, `workflows/`, `.agents/` — Keep ours entirely (upstream doesn't have these)

   ### Lock Files
   - `uv.lock` — Regenerate after merge: `uv lock`
   - `package-lock.json` / `pnpm-lock.yaml` in extensions — Regenerate with install

   **Quick conflict resolution commands:**
   ```bash
   # To keep OUR version of a specific file:
   git checkout --ours <file> && git add <file>

   # To accept THEIR version of a specific file:
   git checkout --theirs <file> && git add <file>

   # To keep ours for all files in a directory:
   git diff --name-only --diff-filter=U | grep "^src/pocketpaw/frontend/" | xargs -I{} sh -c 'git checkout --ours "{}" && git add "{}"'

   # To accept theirs for all docs:
   git diff --name-only --diff-filter=U | grep "^docs/" | xargs -I{} sh -c 'git checkout --theirs "{}" && git add "{}"'
   ```

8. **Check for any remaining conflict markers across the ENTIRE project**
   ```bash
   grep -rn "<<<<<<" --include="*.py" --include="*.html" --include="*.js" --include="*.css" --include="*.json" --include="*.toml" --include="*.yaml" --include="*.yml" --include="*.md" src/ docs/ || echo "No conflicts — clean merge!"
   ```

9. **Regenerate lock files if dependencies changed**
   ```bash
   uv lock
   ```

10. **Verify the app still works**
    ```bash
    sh dev.sh
    ```
    Open the dashboard and confirm:
    - Dark mode toggle works
    - /todo and quick chat UI work
    - Extensions load (llama-cpp, freecut, etc.)
    - Settings panel with appearance tab works
    - Agent backends are selectable

11. **Commit the resolved merge** (only if there were conflicts)
    ```bash
    git add -A
    git commit -m "chore: resolve conflicts after upstream sync — kept local customizations"
    ```

12. **Push to fork**
    ```bash
    git push origin main
    ```

## Recovery

If something went wrong and you need to abort or revert:

```bash
# Abort an in-progress merge:
git merge --abort

# Revert to the backup branch:
git checkout backup/pre-sync-<TIMESTAMP>
git branch -D main
git checkout -b main
```

You can also recover from the backup branch list:
```bash
git branch --list "backup/pre-sync-*"
```

## Files with Known Local Customizations

This is an up-to-date list of files where we have significant local changes that MUST be preserved:

### Frontend
| File | Customization |
|------|--------------|
| `templates/base.html` | Dark mode, theme support |
| `templates/components/chat.html` | Quick chat UI, composer assist, /todo |
| `templates/components/extensions.html` | Extension iframe integration |
| `templates/components/sidebar.html` | Custom nav items |
| `js/extensions-sdk.js` | Extension SDK enhancements |
| `js/features/extensions.js` | Extension management UI |
| `js/websocket.js` | WebSocket customizations |

### Backend
| File | Customization |
|------|--------------|
| `dashboard.py` | CSP headers, extension routes, theme support |
| `web_server.py` | CSP blob: allowances, proxy config |
| `config.py` | Custom settings, appearance config |
| `dashboard_ws.py` | WebSocket handler customizations |
| `dashboard_channels.py` | Channel management tweaks |

### Extensions
| File | Customization |
|------|--------------|
| `extensions/registry.py` | Relaxed validation, custom discovery |
| `extensions/manager.py` | Daemon management, Windows compat |
| `extensions/builtin/*/extension.json` | Custom daemon configs |

### Agents
| File | Customization |
|------|--------------|
| `agents/codex_cli.py` | API key handling fix |
| `agents/*.py` | Various backend tweaks |

### Project Root
| File | Customization |
|------|--------------|
| `AGENTS.md` | Our agent instructions |
| `CLAUDE.md` | Our agent instructions |
| `dev.sh` | Dev startup script |
| `pyproject.toml` | Custom dependencies |

## Notes

- **Always create a backup branch** before syncing — this is your escape hatch.
- The `git checkout --ours` / `--theirs` commands are your best friends during conflict resolution.
- If upstream rewrites a file completely, the merge will conflict — review these carefully to manually merge both sets of changes.
- For lock files (`uv.lock`, `package-lock.json`), always regenerate rather than trying to merge.
- Run `uv run ruff check .` after sync to catch any Python style issues introduced.
- Keep this file updated when you add new local customizations to track.
