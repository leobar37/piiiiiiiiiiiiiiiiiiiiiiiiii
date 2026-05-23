# Task Index: Delegación Paralela en Lion (Planificación)

## Tareas

### T-001: Definir Tipos y Eventos para Delegación Paralela
Crear los tipos TypeScript y eventos necesarios para soportar subagentes paralelos en planificación.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/types.ts`
- `packages/extensions/src/extensions/lion/events/defs.ts`

**Dependencias:** Ninguna

**Requerimientos:** FR-002, FR-006, NFR-002

---

### T-002: Implementar Controlador de Ejecución Paralela
Crear la función que ejecuta múltiples subagentes en paralelo con control de concurrencia.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/subagents/parallel.ts` (nuevo)
- `packages/extensions/src/extensions/lion/subagents/index.ts`

**Dependencias:** T-001

**Requerimientos:** FR-003, FR-004, NFR-001

---

### T-003: Implementar Tool `lion_plan_parallel`
Registrar la nueva tool en el sistema de tools de Lion con validación de modo planning.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/tools.ts`

**Dependencias:** T-001, T-002

**Requerimientos:** FR-001, FR-005, FR-007

---

### T-004: Actualizar Prompt de Planificación
Actualizar el system prompt de planificación para informar al orquestador sobre la capacidad de delegación paralela.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/prompts/planning.ts`

**Dependencias:** T-003

**Requerimientos:** FR-001

---

### T-005: Validación y Testing
Verificar que la implementación funciona correctamente y no rompe el flujo existente.

**Archivos afectados:**
- `packages/extensions/src/extensions/lion/` (varios)

**Dependencias:** T-001, T-002, T-003, T-004

**Requerimientos:** Todos
