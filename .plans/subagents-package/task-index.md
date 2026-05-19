# Task Index: packages/subagents (v2 — Controller + RPC Adapter)

## Overview

12 tasks. The architecture has 3 layers: Controller, Instance (with RPC Adapter), and Shared Utilities (EventBus, Summarizer, Artifacts, Execution).

---

## Task Dependency Graph

```
T1 (scaffold)
 |
T2 (types)
 |
├── T3 (event-bus)
├── T4 (summarizer)
├── T5 (artifacts)
|
T6 (session-factory)  -- depends on T2, T3, T5
 |
T7 (instance)         -- depends on T2, T3, T4, T5, T6
 |   ├── RPC Adapter
 |   ├── Lifecycle State Machine
 |   ├── Query Handler
 |   └── Event Forwarding
 |
├── T8 (execution)    -- depends on T2, T7
|
T9 (controller)       -- depends on T2, T3, T5, T7, T8
 |
├── T10 (definitions)
├── T11 (extension)
|
T12 (public API + workspace registration)
```

---

## Tasks

| # | Task | File(s) | Depends On | Description |
|---|------|---------|------------|-------------|
| T1 | Scaffold | `package.json`, `build.ts`, `tsconfig.build.json`, `.gitignore` | — | Package skeleton |
| T2 | Types | `src/types.ts` | T1 | All interfaces: lifecycle, events, tasks, results, RPC state, queries |
| T3 | Event Bus | `src/event-bus.ts` | T2 | Typed pub/sub bus for SubAgentEvents |
| T4 | Summarizer | `src/summarizer.ts` | T2 | Read SessionManager branch, format as markdown summary |
| T5 | Artifact I/O | `src/artifacts/index.ts`, `src/artifacts/reader.ts`, `src/artifacts/writer.ts` | T2 | Read/write `.delegations/` markdown + NDJSON event logs |
| T6 | Session Factory | `src/session-factory.ts` | T2, T3, T5 | Wraps `createAgentSession` with personality injection via ExtensionFactory |
| T7 | SubAgentInstance | `src/instance.ts` | T2, T3, T4, T5, T6 | Core unit: lifecycle, state machine, query(), summarize(), + **RPC Adapter API** |
| T8 | Execution Strategies | `src/execution/index.ts`, `src/execution/sequential.ts`, `src/execution/parallel.ts`, `src/execution/dependency-graph.ts`, `src/execution/execute.ts` | T2, T7 | Sequential, parallel, dependency-graph execution on SubAgentInstance[] |
| T9 | SubAgentController | `src/controller.ts` | T2, T3, T5, T7, T8 | Orchestrator: definitions, instances, executePlan, RPC proxy methods |
| T10 | Definitions | `src/definitions/index.ts`, `src/definitions/planner.ts`, `src/definitions/executor.ts`, `src/definitions/analyzer.ts`, `src/definitions/reviewer.ts` | T2 | Pre-built sub-agent definitions with capabilities |
| T11 | Extension Entry Point | `src/extensions/subagents/index.ts` | T2, T9, T10 | Extension factory for parent pi session: commands + tools |
| T12 | Public API + Workspace | `src/index.ts`, update root `package.json` workspaces | T1–T11 | Public exports, workspace integration |
