# Requerimientos: Delegación Paralela en Lion (Planificación)

## Requerimientos Funcionales

### FR-001: Tool de Delegación Paralela
Lion debe exponer una nueva tool `lion_plan_parallel` que permita lanzar múltiples subagentes en paralelo durante la fase de planificación.

**Criterios de aceptación:**
- La tool acepta un array de tareas, cada una con `agent` (definición de subagente), `prompt` (instrucciones), y opcionalmente `title` (identificación).
- La tool acepta un parámetro opcional `concurrency` para limitar cuántos subagentes corren simultáneamente (default: 3).
- La tool solo funciona cuando Lion está en modo `planning`.
- Si Lion está en modo `building`, la tool rechaza la solicitud con un error claro.

### FR-002: Tipos de Subagentes de Planificación
Los subagentes de planificación usan definiciones especializadas para análisis read-only.

**Criterios de aceptación:**
- Se definen al menos 3 roles de planificación: `analyzer`, `researcher`, `validator`.
- Todos los subagentes de planificación tienen `canEdit: false`, `canWrite: false`, `canExecute: false`.
- Pueden usar `canResearch: true` para investigar el codebase.

### FR-003: Ejecución Concurrente
Las tareas se ejecutan en paralelo con control de concurrencia.

**Criterios de aceptación:**
- Se usa un semáforo o `p-limit` para respetar el límite de concurrencia.
- Todas las tareas se inician; las que exceden el límite esperan.
- El resultado se devuelve solo cuando **todas** las tareas han terminado.
- Si una tarea falla, las demás continúan ejecutándose.

### FR-004: Resultados Agregados
El resultado de la tool incluye un resumen de todos los subagentes.

**Criterios de aceptación:**
- El resultado contiene un array con el estado de cada subagente: `index`, `title`, `status`, `summary`.
- Si un subagente falló, incluye el error.
- El orquestador puede ver todos los resultados en una sola respuesta.

### FR-005: Retención de Instancias
Las instancias de subagentes paralelos se retienen para posible follow-up.

**Criterios de aceptación:**
- Cada subagente paralelo se retiene vía `retainSubagent()`.
- El orquestador puede usar `lion_prompt_subagent` para enviar follow-up a cualquiera.
- Las instancias se liberan cuando el orquestador llama `lion_release_subagent` o al finalizar la sesión.

### FR-006: Integración con Eventos
La ejecución paralela emite eventos compatibles con el sistema de eventos de Lion.

**Criterios de aceptación:**
- Emite `lion.delegation.start` para cada subagente.
- Emite `lion.delegation.end` para cada subagente cuando termina.
- Emite un evento nuevo `lion.parallel.complete` cuando todos terminan.
- Los eventos son compatibles con `LionEventBus` y `LionEventStore`.

### FR-007: UI de Subagentes
Los subagentes paralelos aparecen en el widget de subagentes de Lion.

**Criterios de aceptación:**
- Cada subagente paralelo aparece en `runtime.subagentUi`.
- El widget muestra el estado de todos los subagentes en ejecución.
- Se actualiza en tiempo real vía `renderLionSubagentWidget`.

## Requerimientos No-Funcionales

### NFR-001: No Interferencia con Build
La funcionalidad de paralelo en planificación no debe afectar el flujo de build.

### NFR-002: Consistencia de Tipos
Todos los nuevos tipos deben integrarse con `LionEventMap` y seguir las convenciones existentes.

### NFR-003: Manejo de Errores
Si un subagente paralelo falla, los demás deben continuar y el resultado debe indicar claramente cuál falló.
