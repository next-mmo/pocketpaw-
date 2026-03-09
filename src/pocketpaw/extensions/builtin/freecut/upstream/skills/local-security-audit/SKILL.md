---
name: local-security-audit
description: "Run a comprehensive local security audit on any project. Use when: (1) Preparing for a release, (2) Reviewing security posture, or (3) User asks for a security check."
---

# Local Security Audit

Run a deep, offline security audit on any local codebase — covering git history, dependencies, code patterns, Electron/backend config, and build settings. Produces a prioritized findings report with severity ratings and actionable fixes.

## When to use

- Use case 1: When preparing a project for its first public release (Windows, macOS, Linux)
- Use case 2: When the user asks to "check security", "audit", or "review before release"
- Use case 3: When onboarding to an unfamiliar codebase and need to assess its security posture
- Use case 4: After a major refactor or dependency upgrade to verify nothing regressed
- Use case 5: Periodic security hygiene checks on any project

## Required tools / APIs

- No external API required (fully offline)
- `git` — for history and secret scanning
- `npm` / `pip` — for dependency audits (if applicable)
- `grep` / `ripgrep` — for code pattern scanning

No installation needed — uses tools already present on the developer's machine.

## Skills

### 1. git_history_secrets_scan

Scan the entire git history for accidentally committed secrets, credentials, API keys, tokens, and sensitive files. This catches secrets that were committed and later removed — they remain in git history forever.

**Check for secrets in git history:**

```bash
# Search entire git history for common secret patterns
# API keys, tokens, passwords, private keys
git log -p --all -S 'PRIVATE KEY' -- . ':!node_modules' ':!*.lock'
git log -p --all -S 'api_key' -- . ':!node_modules' ':!*.lock'
git log -p --all -S 'apiKey' -- . ':!node_modules' ':!*.lock'
git log -p --all -S 'secret_key' -- . ':!node_modules' ':!*.lock'
git log -p --all -S 'password' -- . ':!node_modules' ':!*.lock'
git log -p --all -S 'AWS_SECRET' -- . ':!node_modules' ':!*.lock'
git log -p --all -S 'GITHUB_TOKEN' -- . ':!node_modules' ':!*.lock'

# Search for .env files that were committed at any point
git log --all --diff-filter=A -- '*.env' '.env.*' '!.env.example' '!.env.sample'

# Check for private key or certificate files ever committed
git log --all --diff-filter=A -- '*.pem' '*.key' '*.p12' '*.pfx' '*.jks' '*.keystore'

# Check if .env is currently tracked (should NOT be)
git ls-files --error-unmatch .env 2>/dev/null && echo "WARNING: .env is tracked!" || echo "OK: .env is not tracked"
```

**Comprehensive git secret patterns to grep:**

```bash
# High-confidence secret patterns in current working tree
# (run from project root, exclude node_modules and lock files)

# AWS
grep -rn --include='*.{js,ts,tsx,py,json,yaml,yml,toml,cfg,ini,env}' \
  -E '(AKIA[0-9A-Z]{16}|aws_secret_access_key|AWS_SECRET)' . --exclude-dir=node_modules

# GitHub / GitLab tokens
grep -rn --include='*.{js,ts,tsx,py,json,yaml,yml}' \
  -E '(ghp_[a-zA-Z0-9]{36}|gho_|ghu_|ghs_|ghr_|glpat-)' . --exclude-dir=node_modules

# Generic API keys / secrets / tokens
grep -rn --include='*.{js,ts,tsx,py,json,yaml,yml,toml}' \
  -iE '(api[_-]?key|api[_-]?secret|auth[_-]?token|access[_-]?token)\s*[:=]\s*["\x27][a-zA-Z0-9+/=_-]{16,}' \
  . --exclude-dir=node_modules

# Private keys embedded in code
grep -rn --include='*.{js,ts,py,json,yaml,yml}' \
  'BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY' . --exclude-dir=node_modules

# JWT tokens (long base64 strings with dots)
grep -rn --include='*.{js,ts,tsx,py,json}' \
  -E 'eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}' . --exclude-dir=node_modules

# Database connection strings with passwords
grep -rn --include='*.{js,ts,py,json,yaml,yml,toml,env}' \
  -iE '(mongodb|postgres|mysql|redis)://[^:]+:[^@]+@' . --exclude-dir=node_modules
```

**Check .gitignore coverage:**

```bash
# Verify critical files are gitignored
for pattern in ".env" ".env.local" "*.pem" "*.key" "*.p12" "*.pfx" "release/" "dist-electron/"; do
  grep -q "$pattern" .gitignore 2>/dev/null && echo "OK: $pattern is in .gitignore" || echo "MISSING: $pattern NOT in .gitignore"
done

# Check for large binary files that shouldn't be in git
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' | \
  awk '/^blob/ && $2 > 1048576 {print $2, $3}' | sort -rn | head -20
```

### 2. git_commit_safety

Check git configuration and hooks for safety.

```bash
# Check if git hooks are set up (e.g., husky for pre-commit)
ls -la .husky/ 2>/dev/null || echo "No .husky directory found"
cat .husky/pre-commit 2>/dev/null || echo "No pre-commit hook"

# Check if commit signing is configured
git config --get commit.gpgsign || echo "Commit signing not enabled"

# Check for force-push protection on branches
git config --get-all receive.denyNonFastForwards || echo "No force-push protection"

# List branches and their protection status (local check)
git branch -a

# Check remote URL (ensure not using plain HTTP)
git remote -v | grep -E 'http://' && echo "WARNING: Using HTTP remote (not HTTPS/SSH)" || echo "OK: Remote uses HTTPS or SSH"
```

### 3. dependency_audit

Audit all project dependencies for known vulnerabilities.

**Node.js / npm:**

```bash
# Standard npm audit
npm audit

# Summary only
npm audit --json 2>/dev/null | jq '{
  vulnerabilities: .metadata.vulnerabilities,
  total: (.metadata.vulnerabilities | to_entries | map(.value) | add)
}' 2>/dev/null || npm audit 2>&1 | head -30

# Check for outdated packages with known issues
npm outdated

# Check for typosquatting — verify package names
cat package.json | jq -r '.dependencies, .devDependencies | keys[]' | sort
```

**Python / pip:**

```bash
# pip audit (install if needed: pip install pip-audit)
pip-audit 2>/dev/null || echo "pip-audit not installed. Install with: pip install pip-audit"

# Check for known vulnerabilities in requirements
pip install safety 2>/dev/null && safety check -r requirements.txt 2>/dev/null || \
  echo "safety not installed. Install with: pip install safety"

# Check pinned vs unpinned dependencies
cat requirements.txt 2>/dev/null | grep -v '==' && echo "WARNING: Unpinned dependencies found" || echo "OK: All deps pinned"
cat pyproject.toml 2>/dev/null
```

### 4. code_pattern_scan

Scan source code for dangerous patterns, injection risks, and anti-patterns.

**Dangerous code patterns:**

```bash
# === JavaScript / TypeScript ===

# eval() and Function() constructor — code injection risk
grep -rn --include='*.{js,ts,tsx,jsx}' -E '\beval\s*\(' . --exclude-dir=node_modules
grep -rn --include='*.{js,ts,tsx,jsx}' -E '\bnew\s+Function\s*\(' . --exclude-dir=node_modules

# innerHTML / outerHTML — XSS risk
grep -rn --include='*.{js,ts,tsx,jsx}' -E '\.(innerHTML|outerHTML)\s*=' . --exclude-dir=node_modules

# dangerouslySetInnerHTML — React XSS risk
grep -rn --include='*.{js,ts,tsx,jsx}' 'dangerouslySetInnerHTML' . --exclude-dir=node_modules

# document.write — legacy XSS vector
grep -rn --include='*.{js,ts,tsx,jsx}' 'document\.write' . --exclude-dir=node_modules

# Unescaped template literals in SQL/HTML
grep -rn --include='*.{js,ts,tsx}' -E 'query\s*\(\s*`' . --exclude-dir=node_modules

# === Python ===

# eval/exec — code injection
grep -rn --include='*.py' -E '\b(eval|exec)\s*\(' . --exclude-dir=.venv --exclude-dir=__pycache__

# subprocess with shell=True — command injection
grep -rn --include='*.py' 'shell\s*=\s*True' . --exclude-dir=.venv --exclude-dir=__pycache__

# os.system — command injection
grep -rn --include='*.py' 'os\.system\s*\(' . --exclude-dir=.venv --exclude-dir=__pycache__

# Pickle deserialization — arbitrary code execution
grep -rn --include='*.py' -E '(pickle\.loads|pickle\.load)\s*\(' . --exclude-dir=.venv --exclude-dir=__pycache__

# SQL injection (string formatting in queries)
grep -rn --include='*.py' -E '(execute|cursor)\s*\(\s*f["\x27]' . --exclude-dir=.venv --exclude-dir=__pycache__

# === General ===

# Hardcoded IPs (possible config leaks)
grep -rn --include='*.{js,ts,tsx,py,json,yaml,yml}' \
  -E '\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b' . \
  --exclude-dir=node_modules --exclude-dir=.venv | grep -v '127.0.0.1\|0.0.0.0\|localhost'

# TODO/FIXME/HACK security-related comments
grep -rn --include='*.{js,ts,tsx,py}' -iE '(TODO|FIXME|HACK|XXX).*(secur|auth|password|token|key|secret|vuln)' \
  . --exclude-dir=node_modules --exclude-dir=.venv
```

### 5. electron_security_scan

If the project uses Electron, check for common misconfigurations.

```bash
# Find Electron main process file
find . -name 'main.cjs' -o -name 'main.js' -o -name 'main.ts' | grep -i electron | head -5

# Check webPreferences security settings
grep -rn --include='*.{cjs,js,ts}' -A 10 'webPreferences' . --exclude-dir=node_modules | head -40

# CRITICAL: nodeIntegration should be false
grep -rn --include='*.{cjs,js,ts}' 'nodeIntegration' . --exclude-dir=node_modules
# Should be: nodeIntegration: false

# CRITICAL: contextIsolation should be true
grep -rn --include='*.{cjs,js,ts}' 'contextIsolation' . --exclude-dir=node_modules
# Should be: contextIsolation: true

# Check for sandbox mode
grep -rn --include='*.{cjs,js,ts}' 'sandbox' . --exclude-dir=node_modules | grep -v node_modules

# Check webSecurity (should NOT be disabled)
grep -rn --include='*.{cjs,js,ts}' 'webSecurity' . --exclude-dir=node_modules
# If found as webSecurity: false → CRITICAL

# Check for allowRunningInsecureContent
grep -rn --include='*.{cjs,js,ts}' 'allowRunningInsecureContent' . --exclude-dir=node_modules
# Should NOT exist or be false

# Check shell.openExternal URL validation
grep -rn --include='*.{cjs,js,ts}' -B 3 -A 3 'openExternal' . --exclude-dir=node_modules
# Should validate protocol (only https:// and http://)

# Check for will-navigate handler (prevents navigation hijack)
grep -rn --include='*.{cjs,js,ts}' 'will-navigate' . --exclude-dir=node_modules
# Should exist and block unexpected navigation

# Check preload script exposure surface
grep -rn --include='*.{cjs,js,ts}' 'exposeInMainWorld' . --exclude-dir=node_modules
# Review what's exposed — should be minimal

# Check for remote module (deprecated, dangerous)
grep -rn --include='*.{cjs,js,ts}' -E '(enableRemoteModule|@electron/remote)' . --exclude-dir=node_modules

# Check electron-builder config for code signing
grep -rn --include='*.json' -E '(certificateFile|identity|signingHashAlgorithms|hardenedRuntime)' . --exclude-dir=node_modules

# Check if ASAR packaging is enabled
grep -rn --include='*.json' '"asar"' . --exclude-dir=node_modules
```

### 6. backend_api_security_scan

Check backend API configurations for common vulnerabilities.

```bash
# === CORS ===
# Check for wildcard CORS (allows any origin)
grep -rn --include='*.{py,js,ts}' -E "allow_origins.*\*|origin.*\*|Access-Control-Allow-Origin.*\*" \
  . --exclude-dir=node_modules --exclude-dir=.venv

# Check for credentials + wildcard CORS (browser blocks this but indicates misconfig)
grep -rn --include='*.{py,js,ts}' 'allow_credentials.*True\|credentials.*true' \
  . --exclude-dir=node_modules --exclude-dir=.venv

# === Server Binding ===
# Check if server binds to 0.0.0.0 (exposed to network)
grep -rn --include='*.{py,js,ts,json,yaml,yml,toml}' '0\.0\.0\.0' \
  . --exclude-dir=node_modules --exclude-dir=.venv
# Desktop apps should bind to 127.0.0.1

# === File System Access ===
# Check for unvalidated file path operations
grep -rn --include='*.py' -E 'open\s*\(.*\bfile_path\b' . --exclude-dir=.venv
grep -rn --include='*.{js,ts}' -E "(readFile|writeFile|createReadStream)\s*\(" . --exclude-dir=node_modules

# Check for path traversal guards
grep -rn --include='*.{py,js,ts}' -iE '(path.traversal|\.\.\/|realpath|resolve.*path)' \
  . --exclude-dir=node_modules --exclude-dir=.venv

# === Rate Limiting ===
grep -rn --include='*.{py,js,ts}' -iE '(rate.?limit|throttle|slowdown)' \
  . --exclude-dir=node_modules --exclude-dir=.venv

# === Content Security Policy ===
grep -rn --include='*.{html,js,ts,py}' -iE 'content-security-policy' \
  . --exclude-dir=node_modules --exclude-dir=.venv

# === Debug/Dev modes exposed in production ===
grep -rn --include='*.{py,js,ts,json}' -iE '(debug\s*[:=]\s*true|DEBUG\s*=\s*1|devtools)' \
  . --exclude-dir=node_modules --exclude-dir=.venv
```

### 7. build_and_deploy_security

Check build configurations for security concerns.

```bash
# === Sourcemaps in production ===
grep -rn --include='*.{js,ts,json}' -iE 'sourcemap.*true|source.?map' \
  . --exclude-dir=node_modules | grep -iv 'devtool.*eval\|development'
# Sourcemaps should be disabled in production builds

# === Sensitive files in build output ===
# Check what files are included in the build
cat electron-builder.json 2>/dev/null | jq '.files' 2>/dev/null
# Verify .env, .git, tests, etc. are excluded

# Check for source code leaking into dist
ls -la dist/ 2>/dev/null | head -20
find dist/ -name '*.map' 2>/dev/null | head -10

# === Environment variable exposure ===
# Check for VITE_ prefixed env vars (exposed to client in Vite)
grep -rn --include='*.{ts,tsx,js,jsx}' 'import.meta.env' . --exclude-dir=node_modules
# Ensure no secrets use the VITE_ prefix

# Check for process.env usage in frontend code
grep -rn --include='*.{ts,tsx,js,jsx}' 'process\.env\.' src/ 2>/dev/null

# === Package.json scripts — no secrets in scripts ===
cat package.json | jq '.scripts' 2>/dev/null
```

### 8. git_branch_and_release_safety

Check git workflow safety before release.

```bash
# Check the current branch
git branch --show-current

# Check for uncommitted changes
git status --porcelain

# Check if there are untracked sensitive files
git status --porcelain | grep -E '\.(env|pem|key|p12|pfx|secret)$'

# Check recent commits for any that mention "secret", "key", "password"
git log --oneline -20 --all | grep -iE '(secret|password|key|token|credential|fix.*leak)'

# Check if tags are signed
git tag -v $(git describe --tags --abbrev=0 2>/dev/null) 2>/dev/null || echo "No signed tags found"

# Check for merge conflicts markers left in code
grep -rn --include='*.{js,ts,tsx,py,json,yaml,yml}' -E '^(<{7}|>{7}|={7})' . --exclude-dir=node_modules

# List contributors (verify no unexpected committers)
git shortlog -sn --all | head -20

# Check for commits from unknown emails
git log --format='%ae' --all | sort -u
```

## Output format

The audit should produce a structured report with:

- **Severity**: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low/Info
- **Category**: git-history, dependency, code-pattern, electron, backend, build
- **Finding**: What was found
- **File/Location**: Exact file and line number
- **Risk**: What an attacker could do
- **Fix**: Specific remediation with code example
- **Effort**: Estimated time to fix (minutes/hours)

Organize findings as a prioritized table with fix order.

## Rate limits / Best practices

- Run the full audit before every release
- Run git history scan after any team member change (new contributor)
- Re-run dependency audit weekly or after any `npm install` / `pip install`
- Git history secrets can never be fully removed — if found, rotate the credential immediately
- Keep the audit results private — never commit audit reports to the repo

## Agent prompt

```text
You have local-security-audit capability. When a user asks to audit security, check security, or prepare for release:

1. Identify the project type by checking for package.json, pyproject.toml, electron-builder.json, Cargo.toml, etc.
2. Run ALL applicable audit sections in order:
   a. Git history & secrets scan (ALWAYS — check for leaked credentials in full git history)
   b. Git branch & release safety (ALWAYS — check for uncommitted changes, unsigned tags)
   c. .gitignore coverage (ALWAYS — verify sensitive file patterns are ignored)
   d. Dependency audit (npm audit / pip-audit — based on project type)
   e. Code pattern scan (eval, innerHTML, shell=True, SQL injection patterns)
   f. Electron security (if electron/ directory exists — check webPreferences, IPC, CSP)
   g. Backend API security (if backend/ exists — check CORS, binding, file access, auth)
   h. Build & deploy security (sourcemaps, env vars, included files)
3. Produce a single consolidated report with:
   - Executive summary (total findings by severity)
   - Prioritized findings table with severity, category, fix effort
   - Detailed findings with exact file:line references and fix code
   - "What's already good" section acknowledging existing security measures
   - Priority fix order (quickest wins first)
4. Rate severity as:
   - 🔴 Critical: Remote code execution, secret exposure, data breach
   - 🟠 High: Privilege escalation, significant data leak, missing auth
   - 🟡 Medium: Defense-in-depth gaps, info disclosure, misconfig
   - 🟢 Low: Best practice improvements, hardening
5. IMPORTANT: If secrets are found in git history, recommend credential rotation IMMEDIATELY — git history cleaning is not sufficient.
```

## Troubleshooting

**Git history scan takes too long:**

- Symptom: `git log -p --all -S` hangs on large repos
- Solution: Limit to recent history with `--since="6 months ago"` or specific branches

**npm audit shows vulnerabilities in dev dependencies only:**

- Symptom: High vulnerability count but all in devDependencies
- Solution: Run `npm audit --omit=dev` to see production-only vulnerabilities

**False positives in secret scanning:**

- Symptom: Test files, examples, or documentation trigger secret patterns
- Solution: Manually verify each finding; exclude test directories if confident

**Python venv detected as vulnerability source:**

- Symptom: Scanning finds issues inside `.venv/`
- Solution: Always exclude `.venv/`, `__pycache__/`, and virtual environments from scans

**Electron not detected:**

- Symptom: Electron checks skipped even though app uses Electron
- Solution: Look for `electron` in package.json devDependencies and check for main process file

## See also

- [../web-search-api/SKILL.md](../web-search-api/SKILL.md) — Search for CVE details and security advisories
- [../browser-automation-agent/SKILL.md](../browser-automation-agent/SKILL.md) — Automated security testing via browser

---

## Checklist reference

Quick yes/no checklist for pre-release security review:

```text
GIT SECURITY
[ ] No secrets in git history (API keys, tokens, passwords)
[ ] No .env files tracked in git
[ ] No private keys (.pem, .key, .p12) in git
[ ] .gitignore covers all sensitive patterns
[ ] Remote uses HTTPS or SSH (not plain HTTP)
[ ] Recent commits don't reference credentials

DEPENDENCY SECURITY
[ ] npm audit / pip-audit shows 0 critical vulnerabilities
[ ] All production dependencies are pinned
[ ] No typosquatting risks (package names verified)

CODE PATTERNS
[ ] No eval() or new Function() in source
[ ] No innerHTML or dangerouslySetInnerHTML
[ ] No shell=True in subprocess calls
[ ] No hardcoded credentials in source
[ ] No SQL string interpolation

ELECTRON (if applicable)
[ ] nodeIntegration: false
[ ] contextIsolation: true
[ ] sandbox: true
[ ] shell.openExternal validates URLs (https/http only)
[ ] will-navigate handler blocks unexpected navigation
[ ] Preload bridge exposes minimal API
[ ] Code signing configured (Windows + macOS)
[ ] ASAR packaging enabled

BACKEND (if applicable)
[ ] Server binds to 127.0.0.1 (not 0.0.0.0) for desktop apps
[ ] CORS restricted to specific origins (not *)
[ ] File write paths validated (no path traversal)
[ ] Rate limiting on upload/write endpoints
[ ] No debug mode in production

BUILD & DEPLOY
[ ] Sourcemaps disabled in production
[ ] No secrets in VITE_ env vars
[ ] Build excludes test files, .git, .env
[ ] Content Security Policy configured
```
