# AGENTS.md

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
