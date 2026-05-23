# T-001 Harden SessionHost and LiveSession Core

## Objective

The `SessionHost` and `LiveSession` classes have been drafted in `session-host.ts`. This task must harden them into production-ready implementations: proper error handling, resource enforcement (max sessions, idle timeout), safe runtime lifecycle, and correct message/state reconstruction from disk when the runtime is stopped.

## Requirements Covered

- `FR-001`, `FR-002`, `FR-003`, `FR-004`, `FR-008`, `FR-009`, `FR-010`
- `NFR-001`, `NFR-004`

## Dependencies

- none

## Files or Areas Involved

- `packages/dashboard/src/session-host.ts` — Modify | Harden — core registry and live session logic
- `packages/dashboard/src/types.ts` — Review | Modify — add `SessionHostConfig` if not already there

## Expected Outcome

- `LiveSession` handles all lifecycle transitions safely (`created` → `starting` → `idle` ↔ `streaming` → `stopped` → `error`).
- `SessionHost` enforces `maxActiveSessions` and rejects new starts when at capacity.
- `SessionHost.cleanupIdleSessions()` stops and evicts sessions past `idleTimeoutMs`.
- `LiveSession.getMessages()` and `LiveSession.getState()` work correctly regardless of whether the runtime is active.
- `LiveSession.start()` properly initializes `AgentSession` via `createAgentSession()` and wires event forwarding.
- `LiveSession.stop()` disposes the agent, unsubscribes from events, and transitions to `stopped`.
- All errors during `start()` transition the session to `error` status and propagate.

## Context to Preserve

- `SessionManager` from `coding-agent` must remain the source of truth for disk persistence. Do not bypass it.
- `AgentSession` already has `subscribe()`, `prompt()`, `steer()`, `followUp()`, `abort()`, and `dispose()`. Do not reimplement these.
- The existing `DashboardEventBridge` for global events must remain untouched.

## Constraints

- Do not hold an `AgentSession` in memory for sessions that are not started. This is the key to `NFR-004`.
- The `AgentSessionLike` duck-type interface should be replaced with a real import from `coding-agent` once types are verified.

## Completion Criteria

- `bun run build` in `packages/dashboard` passes.
- `SessionHost` can create 10 sessions, start 5, and reject the 6th start with a clear error.
- Stopping a session and calling `getMessages()` returns the conversation history reconstructed from `SessionManager`.
- Calling `prompt()` on a stopped session throws a clear error.

## Validation

- `bun run build` in `packages/dashboard`
- Manual verification via a small test script (create, start, prompt, stop, getMessages)

## Expected Final Report

- Files changed and why
- Lifecycle state diagram (textual)
- Error handling strategy
- Validation results

## Risks or Notes

- `createAgentSession()` may fail if no model/auth is configured. The error must be caught and surfaced.
- Event publisher cleanup must be verified — unsubscribing and clearing references to avoid leaks.
