# T-001: Definir Tipos y Eventos para Delegación Paralela

## Objetivo
Crear los tipos TypeScript y eventos necesarios para soportar subagentes paralelos en la fase de planificación de Lion.

## Archivos a Modificar

### 1. `packages/extensions/src/extensions/lion/types.ts`

Agregar los siguientes tipos:

```typescript
// Nuevo tipo de rol para subagentes de planificación
export type LionPlanningSubagentRole = "analyzer" | "researcher" | "validator";

// Configuración de una tarea paralela
export interface LionParallelTask {
  agent: LionPlanningSubagentRole;
  title: string;
  prompt: string;
}

// Resultado de una tarea paralela individual
export interface LionParallelTaskResult {
  index: number;
  title: string;
  agent: LionPlanningSubagentRole;
  status: DelegationStatus;
  summary: string;
  error?: string;
  taskId: string;
}

// Resultado agregado de la ejecución paralela
export interface LionParallelResult {
  runId: string;
  tasks: LionParallelTaskResult[];
  completedCount: number;
  failedCount: number;
}
```

Agregar al `LionEventMap`:

```typescript
"lion.parallel.start": LionEventBase & {
  type: "lion.parallel.start";
  taskCount: number;
  concurrency: number;
};
"lion.parallel.complete": LionEventBase & {
  type: "lion.parallel.complete";
  result: LionParallelResult;
};
"lion.parallel.task.start": LionEventBase & {
  type: "lion.parallel.task.start";
  index: number;
  title: string;
  agent: LionPlanningSubagentRole;
};
"lion.parallel.task.end": LionEventBase & {
  type: "lion.parallel.task.end";
  index: number;
  title: string;
  agent: LionPlanningSubagentRole;
  status: DelegationStatus;
  summary: string;
};
```

### 2. `packages/extensions/src/extensions/lion/events/defs.ts`

Agregar los nuevos eventos al objeto `LionEvents`:

```typescript
parallelStart: "lion.parallel.start",
parallelComplete: "lion.parallel.complete",
parallelTaskStart: "lion.parallel.task.start",
parallelTaskEnd: "lion.parallel.task.end",
```

## Validación

- [ ] Los nuevos tipos compilan sin errores (`bun run check`)
- [ ] Los eventos son compatibles con `LionEventBus`
- [ ] No hay conflictos con tipos existentes

## Notas

- `LionPlanningSubagentRole` es un subset de `LionSubagentRole` existente, pero especializado para planificación.
- Los eventos siguen el patrón existente de `lion.delegation.start/end`.
