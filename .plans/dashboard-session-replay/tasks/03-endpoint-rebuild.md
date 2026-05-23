# T-003: Endpoint /api/dashboard/session/rebuild

**Phase**: replay
**Dependencies**: T-002
**Requirements**: FR-003

## Objective

Create an endpoint that reads persisted events and reconstructs the session state.

## Implementation

### Update `router.ts`

```typescript
import { readFileSync } from "node:fs";

// New schema
const RebuildSessionSchema = z.object({
  state: LionDashboardStateSchema.nullable(),
  events: z.array(DashboardEventPayloadSchema),
  runs: z.array(z.object({
    runId: z.string(),
    planSlug: z.string().nullable(),
    taskTitle: z.string().nullable(),
    eventCount: z.number(),
    startedAt: z.number().nullable(),
    endedAt: z.number().nullable(),
  })),
});

export async function rebuildSession(
  eventLogPath: string,
): Promise<{ state: LionDashboardState | null; events: DashboardEventPayload[]; runs: RunSummary[] }> {
  const events: DashboardEventPayload[] = [];
  const runs = new Map<string, RunSummary>();

  try {
    const content = readFileSync(eventLogPath, "utf-8");
    const lines = content.trim().split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const { event } = JSON.parse(line) as { timestamp: number; event: DashboardEventPayload };
        events.push(event);

        // Track runs
        if (event.runId) {
          const existing = runs.get(event.runId);
          if (existing) {
            existing.eventCount++;
            if (event.timestamp) {
              existing.startedAt = Math.min(existing.startedAt ?? Infinity, event.timestamp);
              existing.endedAt = Math.max(existing.endedAt ?? 0, event.timestamp);
            }
          } else {
            runs.set(event.runId, {
              runId: event.runId,
              planSlug: event.planSlug ?? null,
              taskTitle: null, // Would need to extract from events
              eventCount: 1,
              startedAt: event.timestamp,
              endedAt: event.timestamp,
            });
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File doesn't exist or is not readable
  }

  // Reconstruct state from events (last known state)
  const state = reconstructStateFromEvents(events);

  return {
    state,
    events,
    runs: Array.from(runs.values()).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)),
  };
}

function reconstructStateFromEvents(events: DashboardEventPayload[]): LionDashboardState | null {
  // Find the latest state from events
  // This is a simplified reconstruction
  const lastEvent = events[events.length - 1];
  if (!lastEvent) return null;

  return {
    active: true,
    mode: "building",
    activePlan: lastEvent.planSlug ? { slug: lastEvent.planSlug, path: lastEvent.planPath ?? null, kind: null } : null,
    activeTask: lastEvent.taskId ? { id: lastEvent.taskId, title: null, status: "running" } : null,
    activeRun: lastEvent.runId ? { runId: lastEvent.runId, status: "executing", attempt: lastEvent.attempt ?? 1 } : null,
    subagents: [],
    runHistory: [],
  };
}
```

### Add to router

```typescript
export function createDashboardRouter(
  bridge: DashboardEventBridge,
  getStartTime: () => number,
  getLionState?: () => LionDashboardState | null,
  eventLogPath?: string,
  pingIntervalMs = 5000,
) {
  return {
    state: {
      get: os.output(DashboardStateSchema).handler(async () =>
        getDashboardState(bridge, getStartTime, getLionState)
      ),
    },
    events: {
      stream: os.output(eventIterator(DashboardEventPayloadSchema)).handler(async function* ({ signal }) {
        yield* streamDashboardEvents(bridge, signal, pingIntervalMs);
      }),
    },
    session: {
      rebuild: os.output(RebuildSessionSchema).handler(async () => {
        if (!eventLogPath) return { state: null, events: [], runs: [] };
        return rebuildSession(eventLogPath);
      }),
    },
  };
}
```

## Verification

- Endpoint returns correct state from events
- Events are sorted by timestamp
- Runs are summarized correctly
- Empty response when no log file exists
