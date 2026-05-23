# T-004: Estado global reconciliable en Zustand

**Phase**: replay
**Dependencies**: T-003
**Requirements**: FR-004

## Objective

Update the Zustand store to support hydration from server, reconciliation, and live event merging.

## Implementation

### Update `store/dashboard.ts`

```typescript
import { create } from "zustand";

export interface DashboardEventPayload {
  id: string;
  type: string;
  source: "lion" | "subagent";
  payload: unknown;
  timestamp: number;
  runId?: string;
  planSlug?: string;
  planPath?: string;
  taskId?: string;
  attempt?: number;
}

export interface LionDashboardState {
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
}

interface DashboardStoreState {
  // Connection
  connected: boolean;
  error: string | null;

  // Events
  events: DashboardEventPayload[];
  maxEvents: number;
  selectedRunId: string | null;

  // Lion state
  lionState: LionDashboardState | null;

  // Runs
  runs: Array<{
    runId: string;
    planSlug: string | null;
    taskTitle: string | null;
    eventCount: number;
    startedAt: number | null;
    endedAt: number | null;
  }>;

  // Server info
  uptime: number;
  bridgeCount: number;

  // Actions
  hydrate: (data: {
    state: LionDashboardState | null;
    events: DashboardEventPayload[];
    runs: DashboardStoreState["runs"];
  }) => void;
  reconcile: (partial: Partial<DashboardStoreState>) => void;
  appendEvent: (event: DashboardEventPayload) => void;
  selectRun: (runId: string | null) => void;
  setConnected: (connected: boolean) => void;
  setServerInfo: (uptime: number, bridgeCount: number) => void;
  clearEvents: () => void;
}

export const useDashboardStore = create<DashboardStoreState>((set) => ({
  connected: false,
  error: null,
  events: [],
  maxEvents: 500,
  selectedRunId: null,
  lionState: null,
  runs: [],
  uptime: 0,
  bridgeCount: 0,

  hydrate: (data) =>
    set({
      lionState: data.state,
      events: data.events,
      runs: data.runs,
      selectedRunId: null,
    }),

  reconcile: (partial) => set((state) => ({ ...state, ...partial })),

  appendEvent: (event) =>
    set((state) => {
      const next = [...state.events, event];
      if (next.length > state.maxEvents) {
        next.shift();
      }
      return { events: next };
    }),

  selectRun: (runId) => set({ selectedRunId: runId }),

  setConnected: (connected) => set({ connected }),

  setServerInfo: (uptime, bridgeCount) => set({ uptime, bridgeCount }),

  clearEvents: () => set({ events: [] }),
}));
```

### Update `EventStream.tsx`

```typescript
// On connect, first hydrate from server, then subscribe to live events
async function connect() {
  // 1. Hydrate from server
  try {
    const session = await orpc.dashboard.session.rebuild();
    hydrate(session);
  } catch {
    // No historical data, continue with live events only
  }

  // 2. Subscribe to live events
  const stream = await orpc.dashboard.events.stream();
  // ... consumeEventIterator ...
}
```

## Verification

- Store hydrates correctly from server data
- Live events are appended to historical events
- State reconciliation merges without losing data
- Run selection filters events correctly
