# T-005: Frontend: Run Selector

**Phase**: frontend
**Dependencies**: T-004
**Requirements**: FR-005

## Objective

Add a run selector component that allows users to view historical runs and switch between them.

## Design

```
┌─ Runs ───────────────────────────────────┐
│ ▼ Current Run (live)                     │
│   run-abc123 · my-plan · T-003 · 45 events│
│   run-def456 · my-plan · T-002 · 32 events│
│   run-ghi789 · other-plan · T-001 · 28 events│
└──────────────────────────────────────────┘
```

## Implementation

### `components/RunSelector.tsx`

```typescript
import { useDashboardStore } from "../store/dashboard.js";

export function RunSelector() {
  const runs = useDashboardStore((s) => s.runs);
  const selectedRunId = useDashboardStore((s) => s.selectedRunId);
  const selectRun = useDashboardStore((s) => s.selectRun);
  const connected = useDashboardStore((s) => s.connected);

  return (
    <div className="border-b border-gray-800 bg-gray-900 px-4 py-2">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Runs</div>
      <div className="flex gap-2 overflow-x-auto">
        {connected && (
          <button
            onClick={() => selectRun(null)}
            className={`rounded px-3 py-1.5 text-xs whitespace-nowrap ${
              selectedRunId === null
                ? "bg-blue-900/40 text-blue-300 border border-blue-800"
                : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            ● Current (live)
          </button>
        )}
        {runs.map((run) => (
          <button
            key={run.runId}
            onClick={() => selectRun(run.runId)}
            className={`rounded px-3 py-1.5 text-xs whitespace-nowrap ${
              selectedRunId === run.runId
                ? "bg-blue-900/40 text-blue-300 border border-blue-800"
                : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
          >
            {run.runId.slice(0, 8)} · {run.planSlug ?? "no plan"} · {run.eventCount} events
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Update `App.tsx`

```typescript
import { RunSelector } from "./components/RunSelector.js";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header>...</header>
      <ConnectionStatus />
      <RunSelector />
      <OrchestratorPanel />
      <main className="flex-1 flex flex-col min-h-0">
        <EventLog />
      </main>
      <EventStream />
    </div>
  );
}
```

## Verification

- Run selector shows all historical runs
- Clicking a run filters events to that run
- "Current (live)" button shows when connected
- Empty state when no runs exist
