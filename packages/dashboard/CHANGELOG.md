# Changelog

## [Unreleased]

### Added

- **Project management** — SQLite-backed project persistence with `ProjectService`, `/api/projects.*` oRPC procedures (`list`, `create`, `update`, `archive`), and session-to-project assignment. Existing sessions are automatically imported into an "Imported Sessions" project on first access.
- **Frontend project sidebar** — redesigned sidebar groups sessions by project, supports creating projects from directories, expanding/collapsing projects, and creating sessions within the selected project.
- **SessionHost** — active session orchestrator for the dashboard server. Manages multiple `LiveSession` instances with lifecycle control (`create`, `start`, `stop`), resource limits (`maxActiveSessions`, `idleTimeoutMs`), and per-session SSE event streaming. Sessions expose an `isActive` flag for quick client-side filtering.
- **Session router** — oRPC endpoints under `/api/sessions.*` for full session CRUD + real-time interaction (`create`, `open`, `continueRecent`, `start`, `stop`, `prompt`, `steer`, `followUp`, `abort`, `state.get`, `messages.get`, `events.stream`).
- **Typed oRPC contract** — exported from `contract.ts` for type-safe client consumption via `@orpc/client`.
- **Backend tests** — tests covering `SessionHost`, `LiveSession` lifecycle, `ProjectService`, interaction methods, state access, resource limits, idle cleanup, and error paths.
