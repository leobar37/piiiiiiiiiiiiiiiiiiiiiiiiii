# T-004: Deprecar lion.subagent.event

**Phase**: bridge
**Dependencies**: T-002
**Requirements**: FR-005

## Objective

Eliminar la emision de `lion.subagent.event` desde `createLionSubAgentController`, ya que T-002 ya registra cada controller con `LionDashboardBridge` y los subagent events se obtienen directamente del `SubAgentEventBus` enriquecido.

No ejecutar esta tarea antes de T-002. Si se elimina `lion.subagent.event` antes de registrar controllers en el bridge, el dashboard y cualquier listener temporal perderan subagent events.

## Current Code

```typescript
// packages/extensions/src/extensions/lion/subagents/controller.ts
export function createLionSubAgentController(options: {
  // ...
  emit: LionEventSink;
}): SubAgentController {
  return new SubAgentController({
    // ...
    onEvent: (subagentEvent: SubAgentEvent) => {
      options.emit({
        type: "lion.subagent.event",
        timestamp: Date.now(),
        runId: options.runId,
        planSlug: options.plan.slug,
        planPath: options.plan.rootPath,
        taskId: options.task.id,
        subagentEvent,
      });
    },
  });
}
```

## Changes

1. **Remove** the `onEvent` callback from `createLionSubAgentController`:

```typescript
export function createLionSubAgentController(options: {
  ctx: ExtensionCommandContext;
  runId: string;
  plan: LionPlan;
  task: LionTask;
}): SubAgentController {
  return new SubAgentController({
    definitions: BUILTIN_DEFINITIONS,
    cwd: options.ctx.cwd,
    modelRegistry: options.ctx.modelRegistry,
    // No onEvent callback — events go directly via SubAgentEventBus
  });
}
```

2. **Update** callers in `tools.ts`:

```typescript
// Before:
const controller = createLionSubAgentController({
  ctx,
  emit: (event) => runtime.events.emit(event),
  runId,
  plan,
  task,
});

// After:
const controller = createLionSubAgentController({
  ctx,
  runId,
  plan,
  task,
});
```

3. **Keep** `LionEvents.subagentEvent` in `events/defs.ts` unless a separate audit proves no existing logs, tests, or consumers need to parse it. Do not remove the event definition in this plan.

4. **Audit persistence** before deleting the callback:
- Identify which code writes `.events.jsonl`
- Confirm whether it relies on `lion.subagent.event`
- If persistence currently relies on `lion.subagent.event`, either keep persistence emission separate from dashboard forwarding or add persistence support to `LionDashboardBridge`

## Impact

- **Potential breaking change**: Code that listens for `lion.subagent.event` will no longer receive live subagent events.
- **Mitigation**: The `LionDashboardBridge` now provides subagent events with enrichment for dashboard consumers, and `LionEvents.subagentEvent` remains defined for historical logs.
- **Event logs**: Existing `.lion/plans/*.events.jsonl` files with `lion.subagent.event` entries remain valid.

## Verification

- No references to `lion.subagent.event` remain in active code
- Tests that check for `lion.subagent.event` are updated
- Dashboard still receives subagent events via the enriched bridge
- `.events.jsonl` behavior is explicitly verified or intentionally preserved through another path
