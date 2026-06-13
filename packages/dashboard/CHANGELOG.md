# Changelog

## [Unreleased]

### Added

- **SessionHost** — active session orchestrator for the dashboard server. Manages multiple `LiveSession` instances with lifecycle control (`create`, `start`, `stop`), resource limits (`maxActiveSessions`, `idleTimeoutMs`), and per-session SSE event streaming. Sessions expose an `isActive` flag for quick client-side filtering.
- **Session router** — oRPC endpoints under `/api/sessions.*` for full session CRUD + real-time interaction (`create`, `open`, `continueRecent`, `start`, `stop`, `prompt`, `steer`, `followUp`, `abort`, `state.get`, `messages.get`, `events.stream`).
- **Typed oRPC contract** — exported from `contract.ts` for type-safe client consumption via `@orpc/client`.
- **Backend tests** — tests covering `SessionHost`, `LiveSession` lifecycle, interaction methods, state access, resource limits, idle cleanup, and error paths.
- Collapsible left sessions sidebar and right session inspector with persisted open/close state.
- Double-clicking a canvas session node now focuses and centers the node on the canvas.
- "Add session" now creates a real backend thread via the subagents API and stores the returned `threadId`.
- Project-scoped dashboard sessions with folder selection from Electron and sidebar filtering.

### Changed

- The right session inspector is now hidden entirely when no session is focused instead of showing a "No focused session" placeholder.
