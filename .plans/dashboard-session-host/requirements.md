# Dashboard Session Host — Requirements

## Objective

Enable the Pi dashboard server to create, manage, and interact with multiple live coding-agent sessions through a unified oRPC API, with full backend test coverage and typed contract exports for any client.

## Scope

- In scope: Session host core, oRPC router, contract types, backend tests, server documentation.
- Out of scope: Frontend hooks/UI, auth, multi-user isolation, deployment, legacy deprecation.

## Functional Requirements

- `FR-001` — A `SessionHost` class must maintain a registry of sessions identified by `sessionId`.
- `FR-002` — Sessions can be created (`create`), opened from disk (`open`), or continued from the most recent (`continueRecent`).
- `FR-003` — Each session can be started (`start`) to instantiate an `AgentSessionRuntime`, or stopped (`stop`) to release it while keeping disk persistence.
- `FR-004` — A running session must support `prompt`, `steer`, `followUp`, and `abort` operations.
- `FR-005` — Each running session must expose a per-session SSE event stream (`events.stream`) emitting `AgentSessionEvent` objects.
- `FR-006` — The dashboard router must expose all session operations under `/api/sessions.*` via oRPC.
- `FR-007` — A typed oRPC contract must be exported from the dashboard package for client consumption.
- `FR-008` — Sessions that are idle longer than a configurable timeout must be automatically stopped.
- `FR-009` — A maximum number of concurrently running sessions must be enforced.
- `FR-010` — Messages and runtime state must be readable even when a session is stopped (reconstructed from disk).

## Non-Functional Requirements

- `NFR-001` — All new code must be fully typed (no `any`).
- `NFR-002` — Backend tests must cover session creation, start/stop lifecycle, prompt execution, event streaming, resource limits, idle cleanup, and error paths.
- `NFR-003` — The oRPC contract must remain backward-compatible with existing dashboard endpoints (`state.get`, `events.stream`).
- `NFR-004` — Memory usage per idle session must be minimal (no `AgentSession` runtime held).
- `NFR-005` — All public APIs must have JSDoc documentation.

## Acceptance Criteria

- A client can `POST /api/sessions.create` to create a session, `POST /api/sessions.start` to start it, `POST /api/sessions.prompt` to send a message, and `GET /api/sessions.events.stream` to receive SSE events.
- Multiple sessions can be started and prompted independently without cross-talk.
- `bun run build` in `packages/dashboard` passes without errors.
- All new backend tests pass.
- README and CHANGELOG document the new server capabilities.

## Constraints

- Must reuse existing `AgentSession`, `AgentSessionRuntime`, and `SessionManager` from `coding-agent`.
- Must use oRPC (already a dependency) for the API layer.
- Must not break existing `DashboardEventBridge` global event streaming.

## Open Questions

- Should the contract export use `@orpc/client` primitives or a plain Zod-based contract?
