# T-003: Enriquecer dashboard.state.get

**Phase**: enrich
**Dependencies**: T-002
**Requirements**: FR-003

## Objective

Update the `dashboard.state.get` endpoint to return a rich state snapshot of the Lion orchestrator, not just uptime and bridge count.

## Current State

```typescript
// router.ts
export interface DashboardState {
  uptime: number;
  bridgeCount: number;
  subscriberCount: number;
  recentEvents: DashboardEventPayload[];
}
```

## New State

```typescript
export interface DashboardState {
  // Server info
  uptime: number;
  bridgeCount: number;
  subscriberCount: number;
  recentEvents: DashboardEventPayload[];

  // Lion orchestrator state
  lion: {
    active: boolean;
    mode: "planning" | "building" | null;
    activePlan: { slug: string | null; path: string | null; kind: string | null } | null;
    activeTask: { id: string | null; title: string | null; status: string } | null;
    activeRun: { runId: string | null; status: string; attempt: number } | null;
    subagents: Array<{
      taskId: string;
      role: string;
      status: string;
      turnCount: number;
      currentTool: string | null;
      summary: string | null;
      startedAt: number;
      updatedAt: number;
    }>;
    runHistory: Array<{
      runId: string;
      planSlug: string;
      taskTitle: string;
      status: string;
      attempts: number;
      createdAt: number;
    }>;
  };
}
```

## Implementation

### Update `getDashboardState` in `router.ts`

```typescript
export async function getDashboardState(
  bridge: DashboardEventBridge,
  getStartTime: () => number,
  getLionState?: () => LionDashboardState | null,
): Promise<DashboardState> {
  return {
    uptime: Date.now() - getStartTime(),
    bridgeCount: bridge.bridgeCount,
    subscriberCount: bridge.getSubscriberCount(),
    recentEvents: bridge.getRecentEvents(),
    lion: getLionState?.() ?? null,
  };
}
```

### Update `createDashboardRouter`

```typescript
export function createDashboardRouter(
  bridge: DashboardEventBridge,
  getStartTime: () => number,
  getLionState?: () => LionDashboardState | null,
  pingIntervalMs = 5000,
) {
  return {
    state: {
      get: os.output(DashboardStateSchema).handler(async () =>
        getDashboardState(bridge, getStartTime, getLionState)
      ),
    },
    // ... events.stream unchanged
  };
}
```

### Update `DashboardDaemon`

```typescript
export class DashboardDaemon {
  // ... existing code ...

  private getLionState: (() => LionDashboardState | null) | null = null;

  setLionStateGetter(getter: () => LionDashboardState | null): void {
    this.getLionState = getter;
  }

  async start(port?: number): Promise<URL> {
    // ...
    const router = createDashboardRouter(
      this.eventBridge,
      () => this.startTime,
      this.getLionState ?? undefined,
    );
    // ...
  }
}
```

### Update `LionDashboardBridge`

```typescript
export class LionDashboardBridge {
  constructor(runtime: LionRuntime, dashboard: DashboardDaemon) {
    this.runtime = runtime;
    this.dashboard = dashboard;
    dashboard.setLionStateGetter(() => this.getStateSnapshot());
  }
  // ...
}
```

## Verification

- `dashboard.state.get` returns lion state when active
- Returns `null` for lion state when no plan is active
- Frontend displays lion state correctly
- Snapshot contains only primitive/copy data and does not retain controller, plan, task, or runtime objects
