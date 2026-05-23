# T-001: Extender ExecutionPlan con chain y concurrency

## Objetivo
Extender los tipos en `packages/subagents` para soportar estrategia `chain` y control de concurrencia en `ExecutionPlan`.

## Cambios en `packages/subagents/src/types.ts`

### 1. Extender ExecutionStrategy

```typescript
export type ExecutionStrategy = "sequential" | "parallel" | "chain";
```

### 2. Extender ExecutionPlan

```typescript
export interface ExecutionPlan {
  strategy: ExecutionStrategy;
  tasks: DelegationTask[];
  concurrency?: number; // Solo para parallel, default: 3
  chainOptions?: {
    passOutputToNext?: boolean; // Default: true
    outputMode?: "append" | "replace" | "template"; // Default: "append"
    template?: string; // Template para inyectar output, ej: "Previous result: {{output}}\n\n{{prompt}}"
    stopOnFailure?: boolean; // Default: true
  };
}
```

### 3. Extender SubAgentInstanceState con metadata de ejecución

```typescript
export interface SubAgentInstanceState {
  instanceId: string;
  taskId: string;
  definitionName: string;
  state: SubAgentState;
  startTime: number | null;
  endTime: number | null;
  turnCount: number;
  lastActivityAt: number;
  currentTool: string | null;
  error: string | null;
  // Nuevos campos
  toolCount: number; // Total de tools ejecutados
  currentToolStartedAt: number | null; // Cuándo empezó el tool actual
  durationMs: number; // Tiempo transcurrido (calculado)
}
```

## Validación

- [ ] Los tipos compilan sin errores
- [ ] `ExecutionPlan` acepta `strategy: "chain"`
- [ ] `concurrency` es opcional y tiene default
- [ ] `chainOptions` tiene valores por defecto razonables

## Notas

- Mantener compatibilidad hacia atrás: `executePlan()` existente debe seguir funcionando
- `chainOptions.template` usa `{{output}}` y `{{prompt}}` como placeholders
