# Task Index: Sistema de Ejecución de Tareas para Subagentes

## Tareas

### T-001: Extender ExecutionPlan con chain y concurrency
Agregar soporte para estrategia `chain` y control de concurrencia en `ExecutionPlan`.

**Archivos afectados:**
- `packages/subagents/src/types.ts`

**Dependencias:** Ninguna

**Requerimientos:** FR-002, FR-004

---

### T-002: Crear TaskExecutor en packages/subagents
Implementar la clase `TaskExecutor` con soporte para parallel, sequential, chain.

**Archivos afectados:**
- `packages/subagents/src/task-executor.ts` (nuevo)
- `packages/subagents/src/index.ts`

**Dependencias:** T-001

**Requerimientos:** FR-001, FR-002, FR-003, FR-004, FR-005

---

### T-003: Implementar estrategia chain
Crear la lógica de ejecución en cadena con paso de output entre tareas.

**Archivos afectados:**
- `packages/subagents/src/execution/chain.ts` (nuevo)
- `packages/subagents/src/execution/index.ts`
- `packages/subagents/src/execution/execute.ts`

**Dependencias:** T-002

**Requerimientos:** FR-002

---

### T-004: Extender eventos de progreso
Agregar eventos en tiempo real para observabilidad durante la ejecución.

**Archivos afectados:**
- `packages/subagents/src/types.ts`
- `packages/subagents/src/instance.ts`
- `packages/subagents/src/task-executor.ts`

**Dependencias:** T-002

**Requerimientos:** FR-003

---

### T-005: Implementar lion_tasks en Lion
Crear la tool `lion_tasks` que usa `TaskExecutor`.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/tools.ts`
- `packages/extensions/src/extensions/lion/types.ts`

**Dependencias:** T-002

**Requerimientos:** FR-006

---

### T-006: Implementar tools de observabilidad
Crear `lion_task_status`, `lion_task_list`, `lion_task_health`.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/tools.ts`

**Dependencias:** T-005

**Requerimientos:** FR-007

---

### T-007: Eliminar tools obsoletas y migrar flujo
Eliminar `lion_start_next_task`, `lion_start_review`, `lion_validate_plan`.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/tools.ts`
- `packages/extensions/src/extensions/lion/subagents/executor.ts`
- `packages/extensions/src/extensions/lion/subagents/reviewer.ts`
- `packages/extensions/src/extensions/lion/subagents/validator.ts`

**Dependencias:** T-005, T-006

**Requerimientos:** FR-008

---

### T-008: Actualizar UI y eventos de Lion
Integrar `lion_tasks` con el sistema de eventos y UI widget existente.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/events/defs.ts`
- `packages/extensions/src/extensions/lion/runtime.ts`
- `packages/extensions/src/extensions/lion/ui/subagents-widget.ts`

**Dependencias:** T-005

**Requerimientos:** FR-003, FR-006

---

### T-009: Actualizar prompt de planificación
Actualizar el system prompt para reflejar la nueva tool `lion_tasks`.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/prompts/planning.ts`

**Dependencias:** T-005

**Requerimientos:** FR-006

---

### T-010: Validación y testing
Verificar que todo funciona correctamente.

**Archivos afectados:**
- `packages/subagents/test/` (nuevos tests)
- `packages/extensions/src/extensions/lion/` (validación)

**Dependencias:** T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009

**Requerimientos:** Todos
