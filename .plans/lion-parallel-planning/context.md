# Contexto: Delegación Paralela de Subagentes en Lion (Fase de Planificación)

## Estado Actual

Lion tiene dos fases distintas:

1. **Fase de Planificación (`planning`)**: El orquestador opera directamente. Ayuda a crear, entender o refinar planes bajo `.plans/`. No hay delegación a subagentes en esta fase.

2. **Fase de Build (`building`)**: Se delega a subagentes especializados:
   - `executor` — implementa la tarea
   - `reviewer` — evalúa el resultado
   - `validator` — valida el plan (read-only)

La delegación en build usa `SubAgentController.executeTask()` secuencialmente (executor → reviewer → corrección si es necesario).

## Referencia: pi-subagents

`pi-subagents` soporta tres modos de ejecución:

- **`SINGLE`**: Un agente, una tarea
- **`PARALLEL`**: Múltiples tareas concurrentes con límite de concurrencia configurable
- **`CHAIN`**: Pipeline secuencial donde cada paso recibe el output del anterior

El modo `PARALLEL` usa `Promise.all()` con control de concurrencia vía semáforo, permitiendo lanzar N tareas con hasta M concurrentes.

## Objetivo

Agregar a Lion, **solo en la fase de planificación**, la capacidad de lanzar **subagentes en paralelo** para tareas de análisis, investigación o refinamiento del plan.

## Casos de Uso

1. **Análisis multi-ángulo**: Lanzar 3 subagentes analizadores en paralelo, cada uno enfocado en un aspecto diferente del plan (riesgos, dependencias, acceptance criteria).
2. **Investigación de dependencias**: Múltiples subagentes investigando diferentes partes del codebase en paralelo para entender impacto.
3. **Comparación de enfoques**: Lanzar variantes de una tarea de planificación y comparar resultados.

## Archivos Clave Involucrados

- `packages/extensions/src/extensions/lion/tools.ts` — Registro de tools de Lion
- `packages/extensions/src/extensions/lion/types.ts` — Tipos de Lion
- `packages/extensions/src/extensions/lion/core.ts` — Estado del core de Lion
- `packages/extensions/src/extensions/lion/runtime.ts` — Runtime y gestión de subagentes
- `packages/extensions/src/extensions/lion/subagents/controller.ts` — Creación del controller
- `packages/extensions/src/extensions/lion/subagents/executor.ts` — Delegación del executor
- `packages/extensions/src/extensions/lion/subagents/reviewer.ts` — Delegación del reviewer
- `packages/extensions/src/extensions/lion/subagents/validator.ts` — Delegación del validator
- `packages/extensions/src/extensions/lion/prompts/planning.ts` — Prompt de planificación
- `packages/extensions/src/extensions/lion/events/defs.ts` — Definición de eventos

## Patrón a Seguir

El patrón de `pi-subagents` para paralelo:

1. Definir array de tareas con `agent` + `task` (prompt)
2. Controlar concurrencia máxima
3. Ejecutar todas, esperar a que terminen
4. Agregar resultados con índice/origin
5. Retener instancias para follow-up si es necesario

## Restricciones

- Solo disponible en modo `planning` (no en `building`)
- No debe interferir con el flujo existente de build
- Los subagentes de planificación son read-only (no editan archivos)
- Debe integrarse con el sistema de eventos existente de Lion
- Debe soportar retención de instancias para follow-up
