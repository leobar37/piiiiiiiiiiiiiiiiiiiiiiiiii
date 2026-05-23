# T-005: Frontend: Panel de Orchestrator

**Phase**: frontend
**Dependencies**: T-003
**Requirements**: FR-006

## Objective

Add an orchestrator panel to the dashboard frontend that shows the current Lion state: active plan, task, run, and subagents.

## Design

```
┌─────────────────────────────────────────────────────────────┐
│  Pi Dashboard                                    Connected  │
├─────────────────────────────────────────────────────────────┤
│  Orchestrator                                               │
│  ┌─ Plan: my-feature-plan ─────────────────────────────┐   │
│  │  Task: T-003 Implement auth (in_progress)           │   │
│  │  Run: run-abc123 [attempt 2/3] [executing]          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Sub-agents (2)                                             │
│  ┌─ executor (#task-1) ────────────────────────────────┐   │
│  │  ● running  • turn 3  • tool: edit                  │   │
│  │  "Adding validation for..."                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─ reviewer (#task-2) ────────────────────────────────┐   │
│  │  ● running  • turn 1  • tool: read                  │   │
│  │  "Reviewing implementation"                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Event Log                                                  │
│  ...                                                        │
└─────────────────────────────────────────────────────────────┘
```

## Components

### `OrchestratorPanel.tsx`

Shows:
- Active plan (slug, path)
- Active task (id, title, status)
- Active run (runId, status, attempt counter)
- If no plan is active, show "No active plan"

### `SubagentList.tsx`

Shows:
- List of subagents from `lion.subagents`
- Each card shows: role, status badge, turn count, current tool, summary
- Color coding: running (green), completed (blue), failed (red), queued (gray)

### `RunHistory.tsx`

Shows:
- Last 10 runs from `lion.runHistory`
- Each row: runId, plan, task, status, attempts, timestamp

## State Updates

Update Zustand store to include lion state:

```typescript
interface DashboardStoreState {
  // ... existing fields ...
  lionState: LionDashboardState | null;
  setLionState: (state: LionDashboardState | null) => void;
}
```

Update `ConnectionStatus` to also fetch and store lion state:

```typescript
const state = await orpc.dashboard.state.get();
setServerInfo(state.uptime, state.bridgeCount);
setSubscriberCount(state.subscriberCount);
setLionState(state.lion);
```

## Verification

- Panel shows correct plan/task/run when active
- Subagent cards update in real-time
- Run history displays correctly
- Empty state shown when no plan is active
