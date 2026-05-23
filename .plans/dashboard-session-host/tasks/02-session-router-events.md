# T-002 Finalize Session Router and DashboardDaemon Integration

## Objective

Wire all session oRPC endpoints into the `DashboardDaemon` so the unified server exposes both legacy dashboard routes (`state.get`, `events.stream`) and the new session routes (`sessions.*`). Ensure the router is complete, typed, and the SSE event streaming endpoint works end-to-end.

## Requirements Covered

- `FR-005`, `FR-006`
- `NFR-003`

## Dependencies

- `T-001`

## Files or Areas Involved

- `packages/dashboard/src/session-router.ts` — Modify | Complete — add any missing endpoints, fix schemas
- `packages/dashboard/src/router.ts` — Modify | Integrate — combine dashboard + session routers
- `packages/dashboard/src/daemon.ts` — Modify | Wire — pass `sessionHost` into router, ensure stop() disposes sessions
- `packages/dashboard/src/index.ts` — Modify | Exports — expose `SessionRouter` type

## Expected Outcome

- The oRPC router exposes all session operations: `create`, `list`, `get`, `open`, `continueRecent`, `remove`, `start`, `stop`, `prompt`, `steer`, `followUp`, `abort`, `state.get`, `messages.get`, `events.stream`.
- `DashboardDaemon.start()` creates a router that includes both legacy and session routes.
- `DashboardDaemon.stop()` calls `sessionHost.dispose()` to cleanly stop all runtimes.
- The SSE stream `sessions.events.stream` yields `AgentSessionEvent` objects with ping keepalive.
- Existing dashboard endpoints (`state.get`, `events.stream`) remain untouched and functional.

## Context to Preserve

- Existing `DashboardEventBridge` global SSE stream must continue working exactly as before.
- The `CORSPlugin` configuration must cover new session endpoints.

## Constraints

- Router must be a single oRPC handler mounted at `/api`. No second HTTP server.
- Session endpoints should use clear Zod schemas for every input and output.

## Completion Criteria

- A manual HTTP test against `POST /api/sessions.create` returns a session info object.
- `POST /api/sessions.start` transitions the session to `idle`.
- `POST /api/sessions.prompt` sends a message and triggers streaming.
- `GET /api/sessions.events.stream?sessionId=xxx` (or equivalent oRPC SSE) emits events.
- `GET /api/state.get` still returns dashboard state.

## Validation

- `bun run build` in `packages/dashboard`
- Manual curl/oRPC client test script against running daemon

## Expected Final Report

- Endpoint inventory with methods and paths
- How the router composition works
- Validation results from manual HTTP tests

## Risks or Notes

- oRPC SSE syntax with `eventIterator` must be verified against the installed `@orpc/server` version.
- The session event stream must use the session's own `EventPublisher`, not the global `DashboardEventBridge`.
