---
name: secure-local-app
description: >
  Comprehensive guide for securing desktop/local applications against license bypass,
  reverse engineering, and piracy. Use this skill when building or shipping commercial
  desktop apps with Python, Electron, Tauri, or similar stacks. Covers: license protection,
  code obfuscation, server-side gating, SSO integration (Casdoor/Auth0/Keycloak),
  hardware fingerprinting, anti-tamper, export locking, and architecture patterns for
  GPU-heavy apps (editors, creative tools). Trigger whenever the user mentions: selling
  an app, license protection, anti-piracy, code obfuscation, Nuitka, PyInstaller security,
  Electron security, desktop app monetization, or protecting local software.
---

# Secure Local App

A skill for designing and implementing license protection and anti-piracy measures
for commercial desktop applications.

## Quick Decision: Which Protection Pattern?

Ask yourself: **"Where does the VALUE live?"**

```
IF   app value = data/API/cloud service    → Pattern A: Server-Gated Logic
ELIF app value = CPU-bound processing      → Pattern A: Server-Gated Logic
ELIF app value = GPU/real-time editing      → Pattern B: Output Gating
ELIF app value = offline content/tools      → Pattern C: Layered Local Protection
```

Then read the appropriate reference file:

| Pattern | When to Use | Reference |
|---------|------------|-----------|
| **A: Server-Gated Logic** | SaaS-like apps, API wrappers, data processing | `references/server-gated.md` |
| **B: Output Gating** | Editors, creative tools, GPU-heavy apps | `references/output-gating.md` |
| **C: Layered Local** | Fully offline apps, CLI tools, utilities | `references/layered-local.md` |

## Core Principles (Apply to ALL Patterns)

### 1. No Protection is 100% — Set Realistic Goals

- **Goal**: Stop 95% of casual piracy, not 100% of determined crackers
- **Rule**: Never let protection degrade legitimate user experience
- **Mindset**: Make buying easier than cracking

### 2. Defense in Depth

Never rely on a single protection. Layer multiple strategies:

```
Layer 1: Code hardening (Nuitka/obfuscation)       — raises effort
Layer 2: License validation (Keygen/Cryptlex/SSO)   — blocks sharing
Layer 3: Server dependency (gated features/exports)  — blocks cracking
Layer 4: Integrity checks (hash verification)        — detects tampering
Layer 5: Telemetry (anonymous usage stats)           — detects anomalies
```

### 3. The Protection Budget

Match protection investment to revenue:

| Stage | Revenue | Recommended Investment |
|-------|---------|----------------------|
| Pre-launch | $0 | Nuitka (free) + simple key validation |
| Early | <$5K/mo | + Keygen/Cryptlex + 1-2 server-gated features |
| Growing | $5-50K/mo | + SSO (Casdoor) + hardware fingerprint + integrity checks |
| Scale | >$50K/mo | + Custom anti-tamper + legal enforcement + Nuitka Commercial |

---

## Technology Quick Reference

### Code Hardening

| Tool | Language | Cost | Protection Level |
|------|----------|------|-----------------|
| **Nuitka** | Python | Free / Commercial | High — compiles to C binary |
| **Cython** | Python | Free | Medium — C extensions |
| **PyArmor** | Python | Free / Paid | Medium — bytecode obfuscation |
| **bytenode** | JS/Electron | Free | Medium — V8 bytecode |
| **asar encryption** | Electron | Free | Low-Medium — encrypts asar |
| **pkg** | Node.js | Free | Medium — single binary |

### License Services

| Service | Cost | Features |
|---------|------|----------|
| **Keygen** | Free tier / Paid | Full-featured, API-first, hardware fingerprinting |
| **Cryptlex** | Free tier / Paid | Similar to Keygen, good SDKs |
| **LemonSqueezy** | % of sales | Payment + license combined |
| **Custom (Casdoor SSO)** | Self-hosted (free) | Full control, user management, OAuth2/OIDC |

### SSO Providers (for custom license server)

| Provider | Cost | Best For |
|----------|------|----------|
| **Casdoor** | Free (self-host) | Full control, budget-friendly |
| **Keycloak** | Free (self-host) | Enterprise, complex RBAC |
| **Auth0** | Free tier / Paid | Quick setup, managed service |
| **Supabase Auth** | Free tier / Paid | Already using Supabase |

---

## Architecture Templates

Read the appropriate reference file for detailed implementation:

- `references/server-gated.md` — Full FastAPI + Casdoor + Electron architecture
- `references/output-gating.md` — Editor/GPU app protection patterns
- `references/layered-local.md` — Offline-first protection
- `references/nuitka-setup.md` — Step-by-step Nuitka compilation guide
- `references/electron-hardening.md` — Electron-specific security measures

### Build Tooling

- `references/uv-nuitka-build.md` — UV package manager + Nuitka build workflow, CI/CD, workspace setup
- `references/electron-vite-build.md` — Electron-Vite config, terser minification, secure IPC, backend spawner, full build pipeline

---

## Common Mistakes to Avoid

1. **Local-only license check** — Easily patched, never rely on this alone
2. **Obfuscation as sole protection** — Slows attackers but doesn't stop them
3. **Over-protecting early** — Wastes dev time, annoys users, delays launch
4. **Ignoring UX** — If protection makes the app worse, users will pirate out of frustration
5. **Rolling your own crypto** — Use established libraries and services
6. **Storing secrets in client code** — Assume everything local is readable
7. **No graceful degradation** — App should work (limited) if server is down
