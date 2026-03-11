---
description: Safely merge upstream changes without losing local customizations (dark mode, quick chat UI, etc.)
---

# Safe Upstream Sync

This workflow merges upstream/main into the local fork while protecting custom frontend features.

// turbo-all

## Steps

1. **Fetch upstream**
```bash
git fetch upstream
```

2. **Check how many commits are ahead**
```bash
git log --oneline HEAD..upstream/main
```
If there are no new commits, stop here — already up to date.

3. **Back up locally-customized frontend files before merge**
```bash
git stash push -m "pre-upstream-sync-$(date +%Y%m%d-%H%M%S)" -- src/pocketpaw/frontend/
```
This stashes ONLY the frontend directory so your customizations are saved.

4. **Merge upstream (keep both histories)**
```bash
git merge upstream/main --no-edit
```

5. **Re-apply your frontend customizations on top**
```bash
git stash pop
```
If there are conflicts, git will tell you. Resolve them manually — your version is almost always the one to keep for UI files.

6. **Check for conflict markers**
```bash
grep -rn "<<<<<<" src/pocketpaw/frontend/ || echo "No conflicts — clean merge!"
```

7. **If conflicts exist**, open the conflicting files and resolve them. For each conflict:
   - Keep YOUR version of dark mode, quick chat UI, composer assist, etc.
   - Accept upstream's version for new features/bugfixes you want
   - Remove all `<<<<<<<`, `=======`, `>>>>>>>` markers

8. **Verify the app still works**
```bash
sh dev.sh
```
Open the dashboard and confirm dark mode, /todo, and quick chat UI work.

9. **Commit the resolved merge** (only if there were conflicts from stash pop)
```bash
git add src/pocketpaw/frontend/
git commit -m "chore: re-apply local customizations after upstream sync"
```

## Notes
- Your customizations live primarily in these files:
  - `templates/base.html` (dark mode)
  - `templates/components/chat.html` (quick chat UI, composer assist, /todo)
  - `templates/components/extensions.html`
  - `templates/components/sidebar.html`
  - `js/extensions-sdk.js`
  - `js/features/extensions.js`
  - `js/websocket.js`
- If upstream rewrites a file completely, `git stash pop` will conflict — that's the safety net telling you to review.
- You can always recover your stash with `git stash list` and `git stash apply stash@{N}`.
