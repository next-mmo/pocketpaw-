# PocketPaw Roadmap

Version: 1.0.0
Date: 2026-03-07
Scope: Roadmap derived from the `0.4.6` codebase and PRD v1

## Roadmap Summary

PocketPaw already has broad platform capability. The roadmap should therefore prioritize:

1. security and permission correctness
2. cross-platform reliability
3. onboarding and release hardening
4. growth features on top of a stable base

## Phase 0: Immediate Blockers

Target: before any v1 release candidate

### Security and auth

- Stop scoped API keys and OAuth tokens from being upgraded into full-access browser sessions
- Enforce scope checks on WebSocket actions, not only REST routers
- Gate all admin operations consistently, including remote access, MCP admin, skills install/remove, and settings mutation
- Review legacy `/api/*` endpoints and align them with `/api/v1` authorization rules

### Quality

- Fix the Windows shell timeout test so it does not rely on `sleep`
- Resolve the mypy duplicate-module issue in the launcher package
- Add regression tests for low-scope credentials attempting admin operations through REST, cookie login, and WebSocket paths

## Phase 1: v1 Foundation

Target: first stable v1 release

### Product hardening

- Publish a single documented auth model for master token, session token, cookie, API key, and OAuth token
- Add explicit capability mapping for admin, channels, memory, chat, settings, and remote access
- Ensure audit coverage for auth changes, remote exposure changes, API key lifecycle, and MCP admin actions
- Normalize error messages so permission failures are clear and predictable

### Cross-platform readiness

- Audit shell and tool behavior for Windows, macOS, and Linux differences
- Verify installer and local-run flows on Windows remain first-class
- Add platform-specific test coverage where command behavior differs

### Documentation

- Add docs for auth scopes and session semantics
- Add docs for remote tunnel safety and production guidance
- Add release docs for backup, recovery, and troubleshooting

## Phase 2: v1.1 Product Usability

Target: immediately after v1 stabilization

### Onboarding

- First-run setup wizard for keys, model provider, memory, and channels
- Health panel that explains failures in action-oriented language
- Safer defaults for new users, especially around shell tools and remote access

### Admin UX

- Permission-aware UI that hides or disables admin actions for non-admin credentials
- Better diagnostics for channel startup and backend initialization
- More visible session, audit, and auth-state introspection in the dashboard

### Data portability

- Export and import for settings, memory, channels, and tokens where safe
- Clear recovery path for corrupted config or failed upgrades

## Phase 3: v1.2 Ecosystem Maturity

Target: once the platform contract is stable

### Extensibility

- Formalize skill install trust model and provenance checks
- Improve MCP preset management and server health reporting
- Define stable contracts for third-party client integrations through `/api/v1`

### Agent workflows

- Harden Mission Control and Deep Work for long-running execution
- Improve cancellation, resume, and session continuity behavior
- Add better cost and token visibility across backends

## Phase 4: Future Growth

Target: post-v1 expansion

### Multi-user direction

- Evaluate real multi-user support with isolated auth, memory, and permissions
- Add role-based access once single-user auth correctness is complete

### Runtime isolation

- Add stronger sandboxing options for shell and tool execution
- Evaluate container-backed or profile-based isolation for high-risk tools

### Packaging

- Continue improving native installer, tray, autostart, and updater flows
- Move toward a polished desktop-first product without losing CLI and self-hosting flexibility

## Suggested Milestones

### Milestone A: Secure Beta Hardening

- Auth/session scope escalation fixed
- WebSocket authorization enforced
- Admin route audit completed
- Regression tests added

### Milestone B: Release Candidate

- Cross-platform test fixes merged
- Mypy clean
- Docs updated for auth and remote access
- Installer and quick-start validation complete

### Milestone C: v1.0 Stable

- Security blockers closed
- Release pipeline green
- Product docs aligned with behavior
- Clear support and troubleshooting path published

## Prioritization Rule

If a roadmap item conflicts with security correctness, permission clarity, or release reliability, the stability item wins. PocketPaw does not need more surface area before it has a trustworthy access model.
