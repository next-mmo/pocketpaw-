# AGENTS.md

## UI & Tech

- Electron React, Shadcn, Tailwind v4, TypeScript, zusntand, pocketpaw backend (core)

## Product Standard

This repository exists to deliver a macOS-native desktop experience inside Electron. Every newly developed feature, screen, interaction, and visual refinement must feel beautiful and fully aligned with the latest macOS 26 Tahoe design language.

Functional but plain is not acceptable. If a feature works but does not look and feel like it belongs in macOS Tahoe, it is not finished.

## UI Direction

- Use macOS 26 Tahoe as the visual source of truth for all new UI work.
- Aim for first-party Apple quality, not generic web-app styling.
- Favor layered depth, translucent materials, careful spacing, refined typography, soft shadows, rounded geometry, and restrained motion.
- Keep controls, panels, menus, windows, hover states, and transitions cohesive with the rest of the desktop shell.
- Design empty, loading, error, disabled, hover, active, and focus states with the same level of polish as the default state.

## Implementation Rules

- Before building new UI, inspect nearby components and match the strongest existing macOS patterns in this codebase.
- Reuse shared tokens, primitives, and established styling patterns before introducing one-off values.
- Avoid flat placeholder layouts, generic SaaS styling, harsh borders, clashing colors, or platform-inconsistent controls.
- Motion should be subtle and purposeful, never noisy or decorative for its own sake.
- Ship work only when the result looks intentional, balanced, and visually credible as a modern macOS Tahoe interface.

## Review Bar

When implementing any new feature or UI change, review it against this standard before considering the task complete:

- Does it look native to macOS 26 Tahoe?
- Is it beautiful without needing apology or follow-up cleanup?
- Does it preserve the overall illusion of a polished macOS desktop product?

If the answer to any of these is no, continue refining before handing the work off.

## Testing

> **⚠️ MANDATORY**: This is an **Electron.js** application. E2E tests use **Playwright's Electron support** (`_electron.launch()`) — **never open a standalone browser** (no `browser_navigate` to `localhost:5173`). Opening the renderer URL in a regular browser will fail because IPC, preload, and main process APIs are unavailable.

### E2E Tests (Playwright + Electron)

Tests live in `tests/smoke/` and use custom fixtures from `tests/smoke/fixtures.ts` that launch the real Electron app.

```

- **Config**: `playwright.electron.config.ts`
- **Fixtures**: `tests/smoke/fixtures.ts` — provides `electronApp` and `window`
- Tests get a real `Page` from the Electron `BrowserWindow` — no `baseURL` or browser projects needed
- Build the app first (`pnpm build`) before running tests
- Tests run serially (`workers: 1`) — only one Electron instance at a time

### Agent Ad-Hoc Testing (MCP Playwright)

For interactive AI-agent testing during development, use **MCP Playwright** tools against the Electron app:

#### ✅ DO

- Use `_electron.launch()` via the smoke test fixtures
- Write tests that import `{ test, expect } from './fixtures'`

#### ❌ DON'T

- Never use `browser_navigate` to `http://localhost:5173` — this opens a regular browser without IPC
- Never create standalone browser-based tests for Electron features
```
