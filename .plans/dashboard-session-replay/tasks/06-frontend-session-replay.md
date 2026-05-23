# T-006: Frontend: Session Replay

**Phase**: frontend
**Dependencies**: T-005
**Requirements**: FR-006

## Objective

Add session replay functionality to view historical runs with event playback.

## Design

When a historical run is selected:
- Show events of that run only
- Show final state of the orchestrator at the end of the run
- Optional: "Play" button to simulate real-time playback

## Implementation

### Update `EventLog.tsx`

Filter events by selected run:

```typescript
const filteredEvents = useMemo(() => {
  let filtered = events;
  
  // Filter by run
  if (selectedRunId) {
    filtered = filtered.filter((e) => e.runId === selectedRunId);
  }
  
  // Filter by source
  if (sourceFilter !== "all") {
    filtered = filtered.filter((e) => e.source === sourceFilter);
  }
  
  // Filter by type
  if (typeFilter) {
    filtered = filtered.filter((e) => e.type.includes(typeFilter));
  }
  
  return filtered;
}, [events, selectedRunId, sourceFilter, typeFilter]);
```

### Update `OrchestratorPanel.tsx`

When a historical run is selected, show the state at the end of that run:

```typescript
export function OrchestratorPanel() {
  const lion = useDashboardStore((s) => s.lionState);
  const selectedRunId = useDashboardStore((s) => s.selectedRunId);
  const events = useDashboardStore((s) => s.events);
  
  // If a historical run is selected, reconstruct state from events
  const displayState = useMemo(() => {
    if (!selectedRunId) return lion; // Live state
    
    // Find last event of this run to reconstruct state
    const runEvents = events.filter((e) => e.runId === selectedRunId);
    const lastEvent = runEvents[runEvents.length - 1];
    if (!lastEvent) return null;
    
    return {
      active: false,
      mode: null,
      activePlan: lastEvent.planSlug ? { slug: lastEvent.planSlug, path: lastEvent.planPath ?? null, kind: null } : null,
      activeTask: lastEvent.taskId ? { id: lastEvent.taskId, title: null, status: "completed" } : null,
      activeRun: { runId: selectedRunId, status: "completed", attempt: lastEvent.attempt ?? 1 },
      subagents: [],
      runHistory: [],
    };
  }, [lion, selectedRunId, events]);
  
  // ... render displayState ...
}
```

### Playback Controls (Optional)

```typescript
function PlaybackControls() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setIsPlaying(!isPlaying)}>
        {isPlaying ? "⏸" : "▶"}
      </button>
      <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}>
        <option value={0.5}>0.5x</option>
        <option value={1}>1x</option>
        <option value={2}>2x</option>
        <option value={5}>5x</option>
      </select>
    </div>
  );
}
```

## Verification

- Historical run shows correct events
- State is reconstructed from events
- Playback controls work (if implemented)
- Switching between runs updates the view
