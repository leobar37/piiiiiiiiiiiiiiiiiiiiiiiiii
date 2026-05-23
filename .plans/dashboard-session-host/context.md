# Dashboard Session Host — Context

## Overview

The Pi dashboard currently operates as a **passive observer**: it reads session files from disk via a standalone `session-server.ts`, but it cannot execute prompts, steer conversations, or manage multiple active agent sessions in parallel. The dashboard's `DashboardDaemon` only exposes state snapshots and SSE streams of bridged events from the Lion orchestrator.

This plan introduces a **SessionHost** architecture that turns the dashboard into an **active session orchestrator**: each session gets a live `AgentSessionRuntime` in memory, with full support for `prompt()`, `steer()`, `followUp()`, `abort()`, and per-session SSE event streaming. Multiple sessions can run concurrently, each isolated, with lifecycle management, idle timeouts, and resource limits.

## Background

- `AgentSession` (in `coding-agent`) already encapsulates everything needed: prompting, event subscription, model management, compaction, etc.
- `AgentSessionRuntime` handles session lifecycle operations (`newSession`, `switchSession`, `fork`).
- The dashboard's existing RPC mode (`rpc-mode.ts`) proves that programmatic control of a live session is already possible — the dashboard just never instantiated it.
- The current `session-server.ts` is a separate HTTP server that only reads `.jsonl` files and returns `501 Not Implemented` for `/prompt`.

## Goal

A unified `DashboardDaemon` where:
1. The oRPC router exposes full session CRUD + real-time interaction endpoints.
2. Each session can be started, stopped, prompted, and streamed independently.
3. A typed oRPC contract is exported for any client (frontend, CLI, external tools).
4. Everything is tested with backend tests covering lifecycle, events, and error paths.
5. The server code is documented with JSDoc, README, and CHANGELOG entries.

## Key Decisions

- **Single server**: `DashboardDaemon` hosts both the global dashboard API and session APIs under `/api`.
- **SessionHost as registry**: A `Map<sessionId, LiveSession>` manages all sessions. Only started sessions consume an `AgentSessionRuntime`.
- **Per-session event publisher**: Each `LiveSession` has its own `EventPublisher<AgentSessionEvent>`. Clients subscribe to a session-specific SSE stream.
- **Lazy runtime**: Sessions are created as `SessionManager` instances on disk first. The runtime (`AgentSession`) is spun up only on `sessions.start()`.
- **Idle cleanup**: Sessions that haven't been interacted with for N minutes are auto-stopped to free resources.
- **oRPC contract**: A `contract.ts` exports TypeScript types so clients can use `@orpc/client` without duplicating schemas.

## Scope Boundaries

- **In scope**:
  - `SessionHost` and `LiveSession` hardened classes
  - `SessionRouter` oRPC endpoints (complete + integrated)
  - `DashboardDaemon` integration of the session router
  - Typed oRPC contract export for external clients
  - Backend tests with full coverage of lifecycle, events, and errors
  - Documentation: JSDoc, README, CHANGELOG
- **Out of scope**:
  - Frontend UI components or React hooks
  - Deprecation/removal of `session-server.ts`
  - Authentication/authorization for session endpoints
  - Multi-user session isolation
  - Docker/deployment changes
