# T-002: Crear LionDashboardBridge

**Phase**: bridge
**Dependencies**: T-001
**Requirements**: FR-002, FR-004

## Objective

Create `LionDashboardBridge` — a class that sits between LionRuntime and DashboardDaemon, enriching events with contextual metadata before forwarding them to the dashboard.

## Architecture

```
LionRuntime
├── events: LionEventBus ──► LionDashboardBridge ──► DashboardDaemon
│                              (enriches events)
├── controllers: Map<runId, SubAgentController>
│   └── SubAgentEventBus ──► LionDashboardBridge ──► DashboardDaemon
│                              (enriches with Lion metadata)
└── dashboard: DashboardDaemon
```

## Implementation

### `packages/extensions/src/extensions/lion/dashboard-bridge.ts` (NEW)

```typescript
import type { DashboardDaemon } from "@local/pi-dashboard";
import type { TypedEvent } from "@local/pi-subagents";
import type { LionRuntime } from "./runtime.js";

export interface EnrichedDashboardEvent {
  id: string;
  type: string;
  source: "lion" | "subagent";
  payload: unknown;
  timestamp: number;
  // Lion metadata
  runId?: string;
  planSlug?: string;
  planPath?: string;
  taskId?: string;
  attempt?: number;
}

export class LionDashboardBridge {
  private runtime: LionRuntime;
  private dashboard: DashboardDaemon;
  private unsubscribers: Array<() => void> = [];
  private controllerUnsubscribers = new Map<string, () => void>();

  constructor(runtime: LionRuntime, dashboard: DashboardDaemon);

  /** Start bridging events from both buses */
  start(): void;

  /** Register a dynamically created controller and enrich its SubAgentEventBus */
  registerController(input: {
    runId: string;
    planSlug: string;
    planPath: string;
    taskId: string;
    attempt?: number;
    controller: SubAgentController;
  }): void;

  /** Stop all subscriptions */
  stop(): void;

  /** Get current state snapshot for dashboard */
  getStateSnapshot(): LionDashboardState;
}
```

### Enrichment Logic

For **Lion events**:
- Extract `runId`, `planSlug`, `planPath`, `taskId`, `attempt` from the event payload
- Forward to dashboard with `source: "lion"`

For **SubAgent events**:
- Subscribe to the controller when `registerController()` is called
- Store only primitive metadata for that controller (`runId`, `planSlug`, `planPath`, `taskId`, `attempt`)
- Forward to dashboard with `source: "subagent"` and enriched metadata

Do not poll `runtime.controllers`. Controllers are created dynamically, so the creator must register them explicitly.

### Controller Registration

In `tools.ts`, after creating and storing a controller:

```typescript
const controller = createLionSubAgentController({
  ctx,
  emit: (event) => runtime.events.emit(event), // removed later in T-004
  runId,
  plan,
  task,
});

runtime.controllers.set(runId, controller);

runtime.dashboardBridge?.registerController({
  runId,
  planSlug: plan.slug,
  planPath: plan.rootPath,
  taskId: task.id,
  attempt,
  controller,
});
```

This task should also add a bridge reference to runtime, for example:

```typescript
dashboardBridge?: LionDashboardBridge;
```

### Temporary Duplicate Guard

Until T-004 removes `lion.subagent.event`, `LionDashboardBridge` must not forward `lion.subagent.event` from `runtime.events` as a separate dashboard row. Either filter it out or complete T-004 in the same change set. The preferred implementation is to filter `lion.subagent.event` in the Lion event subscription once subagent controllers are registered through the bridge.

### State Snapshot

```typescript
export interface LionDashboardState {
  activePlan: { slug: string | null; path: string | null } | null;
  activeTask: { id: string | null; title: string | null } | null;
  activeRun: { runId: string | null; status: string; attempt: number } | null;
  subagents: Array<{
    taskId: string;
    role: string;
    status: string;
    turnCount: number;
    currentTool: string | null;
    summary: string | null;
  }>;
}
```

## Changes to DashboardDaemon

The dashboard needs to accept enriched events. Update `DashboardEventPayload`:

```typescript
export interface DashboardEventPayload {
  id: string;
  type: string;
  source: "lion" | "subagent";
  payload: unknown;
  timestamp: number;
  // Optional enrichment
  runId?: string;
  planSlug?: string;
  planPath?: string;
  taskId?: string;
  attempt?: number;
}
```

## Changes to Lion Extension

In `index.ts`:
```typescript
const bridge = new LionDashboardBridge(runtime, dashboard);
runtime.dashboardBridge = bridge;
bridge.start();
```

Instead of directly bridging:
```typescript
// REMOVE:
// dashboard.bridge(runtime.events, "lion");
```

## Verification

- Events have correct metadata enrichment
- State snapshot reflects current LionRuntime state
- No memory leaks (unsubscribers cleaned up on stop)
- Creating a new controller calls `registerController()` exactly once
- `lion.subagent.event` is not forwarded in parallel with enriched subagent events
