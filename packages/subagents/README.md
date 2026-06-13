# @local/pi-subagents

Session core and web dashboard backend for the [Pi](https://github.com/earendil-works/pi-mono) coding agent. This package hosts the HTTP server, real-time event streaming, standalone agent sessions, and Lion orchestration. It is consumed by the Pi dashboard as the agent backend.

This is a **library package** — it does not register commands or tools in a parent pi session. It is consumed programmatically by an orchestrator that decides when and how to spawn, control, and observe sessions.

---

## Architecture

```
HttpServerTransport (Bun HTTP server)
├── /rpc — oRPC API (threads, lion, logs)
├── /events — SSE streaming
├── / — Static SPA files (subagents frontend)
│
├── StandaloneSessionManager — Creates real AgentSession instances
├── DashboardThreadSessionCache — Resumes persisted sessions
├── DashboardStateManager — Persists and replays events
├── SubAgentController — Legacy subagent orchestration (still used by Lion)
│
└── Lion Runtime (orchestration extension)
    ├── Strategies: none, simple, plan, review
    ├── Task runner with phase-aware delegation
    ├── Checklist service for durable plans
    └── Subagent widget UI
```

---

## Core Concepts

### Web Session Server

The `HttpServerTransport` is a Bun HTTP server that serves:

- `/rpc` — oRPC endpoints for thread CRUD, Lion state, and logs
- `/events` — Server-Sent Events for real-time session updates
- `/` — Static SPA files (the subagents frontend)

Each session is accessible at `/thread/<threadId>` where the subagents frontend renders the session UI.

### Standalone Sessions

`StandaloneSessionManager` creates real, persistent `AgentSession` instances directly from the dashboard, independent of Lion runs or subagent delegation. These are the sessions users interact with in the dashboard canvas.

```typescript
const manager = new StandaloneSessionManager(cwd, modelRegistry, settingsManager);
const info = await manager.create({ name: "My Session" });
// info.instanceId — the threadId used in URLs and API calls
```

### Thread Types

| Kind | Description | Lifecycle |
|------|-------------|-----------|
| `main` | The primary Pi coding-agent session | Controlled by the parent process |
| `standalone` | Independently created agent sessions | Created via `threads.create`, live in backend memory |
| `subagent` | Delegated tasks from Lion orchestration | Created by `SubAgentController`, tracked in `RunStore` |

### Lion Orchestration

Lion is an orchestration extension with four strategies:

| Strategy | Active | Phase | Plan Required | Use Case |
|----------|--------|-------|---------------|----------|
| `none` | `false` | `planning` | No | Default state. Chat normally, subagents on demand. |
| `simple` | `true` | `building` | No | Lightweight delegation without durable tracking. |
| `plan` | `true` | `planning` / `building` | Yes | Structured plan with checklist and task dependencies. |
| `review` | `true` | `planning` / `building` | Yes | Read-only code review with `.reviews/` checklist. |

Commands: `/lion-simple`, `/lion-activate`, `/lion-code-review`, `/lion-build`, `/lion-validate`, `/lion-dashboard`.

---

## API Endpoints (oRPC)

### Threads

| Endpoint | Description |
|----------|-------------|
| `threads.list` | List all threads (main + standalone + subagent) |
| `threads.create` | Create a new standalone session |
| `threads.get` | Get thread state by ID |
| `threads.session` | Get session messages |
| `threads.messages` | Get raw messages array |
| `threads.events` | Get event history |
| `threads.run` | Get run record for subagent threads |
| `threads.prompt` | Send message (prompt / follow_up / steer) |
| `threads.abort` | Abort current turn |
| `threads.commands` | List available slash commands |
| `threads.models` | List available models |
| `threads.model` | Select model for thread |

### Lion

| Endpoint | Description |
|----------|-------------|
| `lion.state` | Get current Lion state |
| `lion.setStrategy` | Change active strategy |
| `lion.checklist` | Read plan or review checklist |

### Logs

| Endpoint | Description |
|----------|-------------|
| `logs.session` | Query session logs |
| `logs.list` | List available log sessions |

---

## Event Streaming

Connect to `/events` for Server-Sent Events. All session activity emits events:

| Event | Emitted when |
|-------|-------------|
| `instance.created` | New session created |
| `instance.state` | Session state changes |
| `session.event` | Raw agent session event |
| `lifecycle.change` | Subagent state transitions |
| `task.start` / `task.end` | Lion task execution |
| `progress.update` | Assistant produces text |
| `error` | Error occurred |

---

## Quick Start

```typescript
import { HttpServerTransport, SubAgentController } from "@local/pi-subagents";

const controller = new SubAgentController({
  definitions: BUILTIN_DEFINITIONS,
  cwd: process.cwd(),
});

const transport = new HttpServerTransport({
  controller,
  port: 0, // auto-assign
  serveFrontend: true,
});

await transport.start();
console.log(`Dashboard at http://localhost:${transport.port}`);
```

---

## Legacy Subagent Controller

`SubAgentController` still orchestrates Lion subagent delegations. It manages:

- `definitions` — Base templates for subagent roles
- `instances` — Live subagent sessions
- `eventBus` — Typed pub/sub for all events

See the source for `SubAgentInstance`, `TaskExecutor`, and `DelegationTask` types.

---

## Dashboard Session Logs

The dashboard writes one JSONL log per Pi session:

```text
.pi/dashboard/logs/<sessionId>.jsonl
```

Each line is a structured record with timestamp, sessionId, threadId, type, source, level, and data.

Logs are exposed through oRPC:

```typescript
await orpc.logs.session({
  sessionId: "019e...",
  threadId: "main:019e...",
  type: "model.select.success",
  level: "info",
  limit: 200,
});
```

---

## Type Exports

```typescript
import type {
  HttpServerTransport,
  HttpServerTransportOptions,
  StandaloneSessionManager,
  DashboardThreadState,
  DashboardLionState,
  SubAgentTransport,
  SubAgentTransportEvent,
  SubAgentController,
  SubAgentInstance,
  LionState,
  LionStrategyName,
  LionEvent,
  SubAgentEvent,
  SubAgentEventMap,
} from "@local/pi-subagents";
```

---

## Build

```bash
cd packages/subagents
bun run build       # Bundle to dist/
bun run watch       # Watch mode
```
