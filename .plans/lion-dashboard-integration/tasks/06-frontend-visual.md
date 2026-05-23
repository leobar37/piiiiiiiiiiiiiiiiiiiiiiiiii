# T-006: Frontend: Enriquecimiento visual

**Phase**: frontend
**Dependencies**: T-005
**Requirements**: FR-007

## Objective

Enhance the event log with visual enrichment: metadata badges, color coding, and contextual information.

## Changes to EventLog

### Metadata Badges

Each event row shows optional badges when metadata is present:

```
[lion]  lion.build.start          [plan: my-plan] [task: T-003] [run: abc123]  2s ago
[subagent]  task.start            [plan: my-plan] [task: T-003] [role: executor]  1s ago
[subagent]  turn.complete         [plan: my-plan] [task: T-003] [role: executor]  just now
```

### Color Coding by Event Type

| Event Type Prefix | Color |
|---|---|
| `lion.build.*` | Blue |
| `lion.delegation.*` | Purple |
| `lion.task.*` | Green |
| `lion.review.*` | Orange |
| `lion.validation.*` | Yellow |
| `lion.rule.*` | Red |
| `task.*` (subagent) | Cyan |
| `turn.*` (subagent) | Gray |
| `tool.*` (subagent) | Pink |

### Implementation

Update `EventLog.tsx`:

```typescript
function getEventColor(type: string): string {
  if (type.startsWith("lion.build.")) return "text-blue-400";
  if (type.startsWith("lion.delegation.")) return "text-purple-400";
  if (type.startsWith("lion.task.")) return "text-green-400";
  if (type.startsWith("lion.review.")) return "text-orange-400";
  if (type.startsWith("lion.validation.")) return "text-yellow-400";
  if (type.startsWith("lion.rule.")) return "text-red-400";
  if (type.startsWith("task.")) return "text-cyan-400";
  if (type.startsWith("turn.")) return "text-gray-400";
  if (type.startsWith("tool.")) return "text-pink-400";
  return "text-gray-300";
}

function EventMetadata({ event }: { event: DashboardEventPayload }) {
  return (
    <div className="flex gap-1">
      {event.planSlug && <span className="badge">plan: {event.planSlug}</span>}
      {event.taskId && <span className="badge">task: {event.taskId}</span>}
      {event.runId && <span className="badge">run: {event.runId.slice(0, 6)}</span>}
    </div>
  );
}
```

## Verification

- Events show correct color based on type
- Metadata badges appear when enrichment is present
- Layout remains readable with many badges
- No visual regression for events without metadata
