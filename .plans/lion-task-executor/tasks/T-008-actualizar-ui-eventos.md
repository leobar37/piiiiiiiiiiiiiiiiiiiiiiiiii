# T-008: Actualizar UI y Eventos de Lion

## Objetivo
Integrar `lion_tasks` con el sistema de eventos y UI widget existente.

## Cambios en `packages/extensions/src/extensions/lion/events/defs.ts`

### Agregar eventos para lion_tasks

```typescript
export const LionEvents = {
  // ... eventos existentes ...

  tasksStart: createEvent<
    "lion.tasks.start",
    { runId: string; planSlug: string; planPath: string; strategy: string; taskCount: number; concurrency?: number }
  >("lion.tasks.start"),

  tasksComplete: createEvent<
    "lion.tasks.complete",
    { runId: string; planSlug: string; planPath: string; result: LionTasksResult }
  >("lion.tasks.complete"),

  tasksTaskStart: createEvent<
    "lion.tasks.task.start",
    { runId: string; planSlug: string; planPath: string; index: number; title: string; definition: string }
  >("lion.tasks.task.start"),

  tasksTaskEnd: createEvent<
    "lion.tasks.task.end",
    { runId: string; planSlug: string; planPath: string; index: number; title: string; definition: string; status: string; summary: string }
  >("lion.tasks.task.end"),
} as const;
```

## Cambios en `packages/extensions/src/extensions/lion/runtime.ts`

### Extender LionSubagentUiState

```typescript
export interface LionSubagentUiState {
  runId: string;
  taskId: string;
  instanceId: string;
  role: LionSubagentRole;
  title: string;
  status: "queued" | "running" | "completed" | "failed";
  turnCount: number;
  toolCount: number;
  currentTool: string | null;
  summary: string | null;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  // Nuevos campos
  definition: string; // Definición del subagente
  strategy: string; // Estrategia de ejecución
  elapsedMs: number; // Tiempo transcurrido
}
```

### Actualizar recordLionSubagentUiEvent

```typescript
export function recordLionSubagentUiEvent(runtime: LionRuntime, event: SubAgentEvent): void {
  if (!("taskId" in event)) return;
  recordLionSubagentJobEvent(runtime, event);
  const existing = runtime.subagentUi.get(event.taskId);
  if (!existing) return;

  const next: LionSubagentUiState = {
    ...existing,
    instanceId: event.instanceId,
    updatedAt: event.timestamp,
  };

  switch (event.type) {
    case "task.start":
      next.status = "running";
      next.title = event.description ?? next.title;
      next.startedAt = event.timestamp;
      break;
    case "turn.complete":
      next.turnCount = Math.max(next.turnCount, event.turnIndex + 1);
      next.toolCount += event.toolCount;
      break;
    case "tool.start":
      next.currentTool = event.toolName;
      break;
    case "tool.end":
      next.currentTool = null;
      break;
    case "progress.update":
      next.summary = event.message || next.summary;
      break;
    case "task.end":
      next.status = event.result.status === "completed" ? "completed" : "failed";
      next.currentTool = null;
      next.summary = event.result.summary;
      next.turnCount = event.result.turnCount;
      next.completedAt = event.timestamp;
      next.elapsedMs = event.result.duration;
      break;
    case "error":
      next.status = "failed";
      next.currentTool = null;
      next.summary = event.error;
      next.completedAt = event.timestamp;
      break;
    case "instance.state":
      // Actualizar estado en tiempo real
      next.turnCount = event.state.turnCount;
      next.currentTool = event.state.currentTool;
      next.elapsedMs = event.state.startTime ? event.timestamp - event.state.startTime : 0;
      break;
  }

  runtime.subagentUi.set(event.taskId, next);
}
```

## Cambios en `packages/extensions/src/extensions/lion/ui/subagents-widget.ts`

### Mostrar definición y estrategia

```typescript
function buildLionSubagentWidgetLines(
  states: Iterable<LionSubagentUiState>,
  theme: Theme,
  width = lineWidth(),
  now = Date.now(),
): string[] {
  // ... código existente ...

  for (const state of ordered.slice(0, 4)) {
    const stats = stateStats(state, now, theme);
    const activity = state.currentTool
      ? `${state.currentTool}`
      : state.summary?.split("\n").find((line) => line.trim())?.trim();

    lines.push(
      clip(
        `${glyph(state, theme)} ${theme.bold(state.role)} ${theme.fg("accent", state.taskId)} ${theme.fg("dim", "·")} ${theme.fg("dim", state.status)}${state.definition ? ` ${theme.fg("dim", "·")} ${state.definition}` : ""}${stats ? ` ${theme.fg("dim", "·")} ${stats}` : ""}`,
        width,
      ),
    );
    if (activity) lines.push(clip(`  ${theme.fg("dim", `⎿  ${activity}`)}`, width));
  }

  // ... resto del código ...
}
```

## Validación

- [ ] Los eventos `lion.tasks.*` se emiten correctamente
- [ ] El UI widget muestra definición y estrategia
- [ ] El estado se actualiza en tiempo real
- [ ] `elapsedMs` se calcula correctamente
- [ ] Las tareas stuck se detectan visualmente

## Notas

- El widget muestra máximo 4 tareas; considerar paginación si hay muchas
- Los colores del tema se usan para diferenciar estados
- `definition` ayuda al orquestador a identificar qué tipo de subagente es
