# PocketPaw Product Requirements Document

Version: 1.0.0
Date: 2026-03-07
Status: Draft v1
Product: PocketPaw
Codebase baseline: `pocketpaw` version `0.4.6`

## 1. Executive Summary

PocketPaw is a self-hosted AI agent platform that runs locally and is controlled through a web dashboard and external channels such as Telegram, Discord, Slack, WhatsApp, and browser clients. The product already includes a large amount of functionality: multi-backend agent orchestration, tools, memory, mission control, deep work, MCP support, security rails, and a no-build frontend.

The main v1 product challenge is no longer feature absence. It is product hardening. The codebase is feature-rich but still behaves like a fast-moving beta in several critical areas:

- Access control is inconsistent between REST, WebSocket, cookie sessions, API keys, and OAuth tokens.
- Some admin-grade surfaces are reachable without strict scope enforcement.
- Platform parity is incomplete, especially on Windows.
- Type-checking and a small number of test paths are not yet release-clean.

PRD v1 positions PocketPaw as a secure local-first agent product for advanced consumers, builders, and self-hosters who want local control, channel flexibility, and extensibility without cloud lock-in.

## 2. Product Vision

PocketPaw should be the most practical self-hosted personal agent for users who want:

- local ownership of data, memory, and credentials
- a single agent accessible from chat apps and the browser
- flexible backend choice across hosted and local models
- built-in tools, automation, and browser workflows
- strong default safety for shell access, secrets, and remote exposure

## 3. Problem Statement

Users can already run powerful local or semi-local AI tooling, but they typically face one of four problems:

- tools are fragmented across chat clients, scripts, browser automations, and local apps
- local-first agent stacks are hard to install and configure
- multi-channel agents often trade away privacy and local control
- advanced power features frequently arrive before production-grade safety and operational clarity

PocketPaw solves the first three well today. v1 must solve the fourth.

## 4. Target Users

### Primary

- Technical self-hosters who want a private personal AI agent
- Developers who want an extensible local agent with tools, memory, and MCP
- Power users managing workflows through chat plus web dashboard

### Secondary

- Small teams experimenting with shared local agents
- Creator-operators who want automation across messaging channels
- Desktop-first users who want installer-based onboarding instead of manual setup

## 5. Current Product Baseline

The current codebase already delivers:

- Event-driven message bus architecture
- Agent loop and agent router with multiple backends
- Web dashboard with WebSocket streaming
- Versioned REST API under `/api/v1`
- Channel adapters for Telegram, Discord, Slack, WhatsApp, Matrix, Teams, and Google Chat
- Tools for shell, filesystem, browser, web search, OCR, voice, Gmail, Drive, Docs, Calendar, Spotify, Reddit, and more
- Memory system with sessions and long-term memory
- Mission Control and Deep Work planning flows
- MCP support and OAuth integrations
- Security features including audit logging, injection scanning, guardian checks, rate limits, and session tokens
- Extensive automated test coverage

## 6. Product Goals For v1

### Goal 1: Security Correctness

Make authentication and authorization behavior explicit, consistent, and enforceable across all interfaces.

### Goal 2: Reliable Cross-Platform Operation

Ensure Windows, macOS, and Linux user journeys behave consistently for core product flows.

### Goal 3: Supportable Release Quality

Reach a state where the product can be shipped, documented, and debugged without relying on tribal knowledge of the codebase.

### Goal 4: Friction-Reduced Onboarding

Preserve power-user flexibility while reducing the setup burden for first-time users.

### Goal 5: Stable Extensibility

Keep MCP, skills, integrations, and backend diversity as differentiators, but place them behind consistent product contracts.

## 7. Non-Goals For v1

- Full enterprise multi-user RBAC
- Hosted cloud control plane
- Large-scale SaaS collaboration features
- Marketplace monetization model for skills/plugins
- Broad visual redesign of the entire frontend

## 8. Key Product Principles

- Local-first by default
- Explicit permission boundaries
- Safe remote access must never be implicit
- Feature depth should not break the beginner path
- Transport should not change authorization semantics
- Beta-only shortcuts must be removed or clearly marked

## 9. Core Product Scope

### In Scope

- Local dashboard and API access
- Auth/session/token model cleanup
- Scoped API keys and OAuth token enforcement
- Remote tunnel hardening
- Windows parity for core commands and tests
- Stable settings, channel management, and admin operations
- Release-quality docs for installation, recovery, and troubleshooting

### Out of Scope

- Full workspace or org management
- Distributed agent execution fleet
- Commercial billing and subscription systems

## 10. Functional Requirements

### FR-1 Authentication Model

PocketPaw must support the following auth types with unambiguous semantics:

- master access token
- short-lived session token
- HTTP-only browser session cookie
- scoped API key
- scoped OAuth access token

Each auth type must preserve its privilege level across REST and WebSocket flows.

### FR-2 Authorization Enforcement

Admin operations must require explicit admin capability. This includes:

- settings mutation
- API key creation and rotation
- remote tunnel start and stop
- MCP server add, remove, and toggle
- skill install and removal
- identity mutation
- webhook administration

No lower-scope credential may gain broader access through session conversion, cookie login, or WebSocket upgrade.

### FR-3 Session Semantics

Cookie login and session exchange must not convert scoped credentials into full-access sessions. Session artifacts must either:

- inherit the original scopes, or
- be unavailable for scoped credentials

### FR-4 WebSocket Policy Consistency

WebSocket actions must follow the same scope rules as REST endpoints. Privileged actions must perform server-side authorization checks before execution.

### FR-5 Remote Access Safety

Remote access must be treated as a privileged capability. Remote tunnel actions must:

- require admin authorization
- be auditable
- expose clear user-facing warnings
- never rely on localhost bypass assumptions once a tunnel is active

### FR-6 Installer and Platform Parity

Core documented flows must work on Windows, macOS, and Linux:

- install
- start dashboard
- authenticate
- save settings
- run a basic tool
- execute a cross-platform shell smoke test

### FR-7 Quality Gates

The repository must pass:

- lint
- non-E2E tests on supported platforms
- type-checking for the default source tree

### FR-8 Operational Observability

Critical auth, remote, MCP, and settings operations must be logged in a way that is actionable for support and debugging.

### FR-9 Documentation Readiness

The product must have up-to-date docs for:

- install paths
- auth model
- API auth and scopes
- remote access safety
- platform-specific limitations
- troubleshooting and recovery

### FR-10 Backward Compatibility Strategy

Legacy `/api/*` behavior may remain temporarily, but privileged legacy routes must not bypass the v1 authorization contract.

## 11. Non-Functional Requirements

### Security

- Least privilege by default
- No scope escalation through transport changes
- Clear separation between admin and non-admin capabilities
- Safe defaults for remote exposure

### Reliability

- Core actions should behave consistently across supported operating systems
- Session and settings writes should remain resilient under concurrent access

### Performance

- Dashboard and API interactions should remain responsive under normal local use
- Security checks must not materially degrade interactive chat

### Maintainability

- Versioned API surfaces should be the primary integration path
- Duplicate auth logic should be reduced or consolidated where practical

## 12. Success Metrics

### Release Metrics

- 0 known P1 auth or privilege-escalation issues
- 0 unauthenticated or low-scope paths to admin operations
- green lint, tests, and mypy for release branches

### Product Metrics

- first successful dashboard run on supported OS in under 15 minutes
- successful channel setup without manual code edits
- remote access setup that is explicit and auditable

### Stability Metrics

- reduction in auth-related bugs
- reduction in platform-specific install or shell issues
- reduced support burden for setup and permissions confusion

## 13. Key Risks and Current Gaps

The current codebase review found the following product blockers for v1:

- scoped API keys and OAuth tokens can currently be converted into unrestricted session cookies
- WebSocket admin actions are not consistently scope-gated
- some legacy and v1 admin surfaces accept authentication but do not enforce authorization strongly enough
- the Windows test path for shell timeout is not portable
- mypy is not currently clean because of duplicate module discovery around the launcher package

These are not minor cleanup items. They are release blockers for a secure v1.

## 14. Release Criteria

PocketPaw v1 is ready when all of the following are true:

- auth and authorization semantics are consistent across REST, WebSocket, cookie, API key, and OAuth flows
- admin-only operations require admin capability everywhere
- remote tunnel actions are explicit, gated, and audited
- documented Windows flows pass without POSIX-only assumptions
- type-checking is clean for the supported repository layout
- user docs match actual product behavior

## 15. Recommended v1 Theme

The right v1 theme for this product is:

`Secure local-first agent platform`

This is stronger than calling v1 a feature release. The codebase already has enough headline features. What it needs now is a trustworthy contract.
