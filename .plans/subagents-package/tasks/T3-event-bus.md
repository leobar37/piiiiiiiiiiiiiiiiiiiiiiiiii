# T3: Event Bus

## Goal
Typed pub/sub bus for SubAgentEvents.

## File: `src/event-bus.ts`

```typescript
export class SubAgentEventBus {
  private listeners: Map<SubAgentEventType | "*", Set<(event: SubAgentEvent) => void>>

  on<T extends SubAgentEventType>(type: T | "*", listener: (event: SubAgentEventMap[T]) => void): () => void
  emit<T extends SubAgentEventType>(event: SubAgentEventMap[T]): void
  off(type: SubAgentEventType | "*", listener: (event: SubAgentEvent) => void): void
  clear(): void
}
```

## Implementation Notes
- Listeners are synchronous
- No event queuing — dropped if no listener
- Controller uses this internally and exposes via `getEventBus()`
- `*` wildcard subscribes to all event types
- Return unsubscribe function from `on()`

## Validation
- Unit test: subscribe, emit, unsubscribe, wildcard
