# T-002: Persistencia de eventos en LionDashboardBridge

**Phase**: persist
**Dependencies**: T-001
**Requirements**: FR-002

## Objective

Add event persistence to `LionDashboardBridge` so that every enriched event is saved to disk for later reconstruction.

## Implementation

### Update `LionDashboardBridge`

```typescript
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export class LionDashboardBridge {
  private eventLogPath: string;
  private maxLogSize = 10 * 1024 * 1024; // 10MB

  constructor(
    private runtime: LionRuntime,
    private dashboard: DashboardDaemon,
  ) {
    this.eventLogPath = join(runtime.persistence.cwd, ".lion", "dashboard", "events.jsonl");
    this.ensureLogDir();
    this.dashboard.setLionStateGetter(() => this.getStateSnapshot());
  }

  private ensureLogDir(): void {
    const dir = join(this.runtime.persistence.cwd, ".lion", "dashboard");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private persistEvent(event: DashboardEventPayload): void {
    try {
      const line = JSON.stringify({ timestamp: Date.now(), event });
      appendFileSync(this.eventLogPath, `${line}\n`, "utf-8");
    } catch {
      // Best effort persistence
    }
  }

  // In enrichLionEvent and enrichSubagentEvent:
  // After creating the enriched event, call this.persistEvent(enrichedEvent)
}
```

### Log Rotation

When the log file exceeds 10MB:
1. Rename `events.jsonl` to `events.{timestamp}.jsonl`
2. Start a new `events.jsonl`
3. Keep only the last 5 rotated files

## Verification

- Events are written to `.lion/dashboard/events.jsonl`
- Each line is valid JSON
- Log rotates when exceeding 10MB
- No errors if directory is not writable
