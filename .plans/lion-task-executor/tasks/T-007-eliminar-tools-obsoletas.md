# T-007: Eliminar Tools Obsoletas y Migrar Flujo

## Objetivo
Eliminar tools reemplazadas por `lion_tasks` y actualizar el flujo de Lion.

## Tools a Eliminar

### De `packages/extensions/src/extensions/lion/tools.ts`

1. **`lion_start_next_task`** → Reemplazado por `lion_tasks` con `strategy: "sequential"` y 1 tarea
2. **`lion_start_review`** → Reemplazado por `lion_tasks` con `strategy: "sequential"` y definición `"reviewer"`
3. **`lion_validate_plan`** → Reemplazado por `lion_tasks` con `strategy: "sequential"` y definición `"validator"`

## Tools a Mantener

- `lion_tasks` — Nueva tool unificada
- `lion_prompt_subagent` — Follow-up a instancias retenidas
- `lion_release_subagent` — Liberar instancias
- `lion_get_run` — Estado general del run
- `lion_task_status` — Estado de tarea específica
- `lion_task_list` — Listar tareas
- `lion_task_health` — Health check
- `lion_activate_plan` — Activar plan
- `lion_finish_current_task` — Finalizar tarea (marcar checklist)

## Archivos a Eliminar

- `packages/extensions/src/extensions/lion/subagents/executor.ts`
- `packages/extensions/src/extensions/lion/subagents/reviewer.ts`
- `packages/extensions/src/extensions/lion/subagents/validator.ts`

## Actualizar `packages/extensions/src/extensions/lion/subagents/index.ts`

```typescript
export { createLionSubAgentController } from "./controller.js";
// Eliminar exports de executor, reviewer, validator
```

## Migración de Flujos

### Antes: Build con executor + reviewer

```
lion_start_next_task() → executor
lion_start_review() → reviewer
lion_finish_current_task()
```

### Después: Build con lion_tasks

```
lion_tasks({
  strategy: "chain",
  tasks: [
    { definition: "executor", title: "Implement", prompt: "..." },
    { definition: "reviewer", title: "Review", prompt: "..." }
  ],
  chainOptions: { passOutputToNext: true }
})
// Revisar resultados
lion_finish_current_task({ status: "approved" })
```

### Antes: Validación de plan

```
lion_validate_plan({ focus: "..." })
```

### Después: Validación con lion_tasks

```
lion_tasks({
  strategy: "parallel",
  tasks: [
    { definition: "validator", title: "Validate structure", prompt: "..." },
    { definition: "analyzer", title: "Analyze risks", prompt: "..." }
  ]
})
```

## Validación

- [ ] `lion_start_next_task` eliminado
- [ ] `lion_start_review` eliminado
- [ ] `lion_validate_plan` eliminado
- [ ] `lion_tasks` cubre todos los casos de uso
- [ ] El flujo de build funciona con `lion_tasks`
- [ ] El flujo de validación funciona con `lion_tasks`

## Notas

- Considerar mantener aliases temporales para compatibilidad
- Actualizar documentación y prompts
- Verificar que no hay referencias a las tools eliminadas en otros archivos
