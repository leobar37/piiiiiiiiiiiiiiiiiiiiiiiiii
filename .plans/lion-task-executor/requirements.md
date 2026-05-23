# Requerimientos: Sistema de Ejecución de Tareas para Subagentes

## Requerimientos Funcionales

### FR-001: TaskExecutor en packages/subagents
Crear una clase `TaskExecutor` que encapsule la ejecución de tareas de subagentes.

**Criterios de aceptación:**
- Acepta un `ExecutionPlan` con estrategia (`parallel`, `sequential`, `chain`)
- Para `parallel`: ejecuta tareas concurrentes con límite de concurrencia
- Para `sequential`: ejecuta tareas una tras otra
- Para `chain`: ejecuta secuencialmente pasando el output de cada tarea como input de la siguiente
- Emite eventos en tiempo real durante la ejecución
- Permite cancelar tareas individuales o el plan completo
- Devuelve resultados agregados al finalizar

### FR-002: Estrategia "chain"
Soportar ejecución en cadena donde el output de una tarea se inyecta en el prompt de la siguiente.

**Criterios de aceptación:**
- Cada tarea en chain recibe el output de la anterior
- El mecanismo de paso de output es configurable (append, replace, template)
- Si una tarea falla, el chain se detiene o continúa según configuración
- El resultado final incluye todos los outputs intermedios

### FR-003: Observabilidad en Tiempo Real
El orquestador puede observar el progreso de las tareas en ejecución.

**Criterios de aceptación:**
- Eventos emitidos: `task.start`, `task.end`, `turn.complete`, `tool.execute`, `progress.update`, `lifecycle.change`
- Cada evento incluye `instanceId`, `taskId`, `timestamp`
- El orquestador puede suscribirse a eventos vía callback
- Metadata disponible: estado, turns, tools, tiempo transcurrido, tool actual

### FR-004: Control de Concurrencia
Para estrategia `parallel`, controlar cuántas tareas ejecutan simultáneamente.

**Criterios de aceptación:**
- Parámetro `concurrency` en `ExecutionPlan` (default: 3, max: 10)
- Semáforo que respeta el límite
- Tareas en espera se encolan
- Si una tarea falla, las demás continúan

### FR-005: Retención de Instancias
Las instancias de subagentes se retienen después de ejecutar para posible follow-up.

**Criterios de aceptación:**
- `TaskExecutor` retiene instancias en `SubAgentController`
- El orquestador puede acceder a instancias por `taskId`
- Las instancias retenidas soportan `prompt`, `steer`, `followUp`
- Las instancias se liberan explícitamente o al hacer `dispose()`

### FR-006: Tool lion_tasks en Lion
Crear una sola tool `lion_tasks` que reemplace las tools de delegación actuales.

**Criterios de aceptación:**
- Recibe `tasks: Array<{ definition, title, prompt, capabilities? }>`
- Recibe `strategy: "parallel" | "sequential" | "chain"`
- Recibe opcional `concurrency: number`
- Recibe opcional `chainOptions: { passOutputToNext?: boolean }`
- Devuelve resultados agregados con metadata de cada tarea
- Retiene instancias para follow-up
- Integra con `LionEventBus` y UI widget

### FR-007: Tools de Observabilidad
Crear tools para que el orquestador inspeccione subagentes en ejecución.

**Criterios de aceptación:**
- `lion_task_status({ task_id })` — estado detallado de un subagente
- `lion_task_list()` — lista todos los subagentes activos/retenidos
- `lion_task_health({ task_id? })` — health check de subagentes

### FR-008: Eliminación de Tools Obsoletas
Eliminar tools que son reemplazadas por `lion_tasks`.

**Criterios de aceptación:**
- Eliminar `lion_start_next_task`
- Eliminar `lion_start_review`
- Eliminar `lion_validate_plan`
- Mantener `lion_prompt_subagent` (follow-up a instancias retenidas)
- Mantener `lion_release_subagent` (liberar instancias)
- Mantener `lion_get_run` (estado general)

## Requerimientos No-Funcionales

### NFR-001: Compatibilidad Hacia Atrás
Los eventos existentes de Lion deben seguir funcionando.

### NFR-002: No Breaking Changes en SubAgentController
`SubAgentController.executeTask()` y `executePlan()` deben seguir funcionando.

### NFR-003: Performance
La ejecución paralela no debe bloquear el hilo principal.

### NFR-004: Testing
Cada estrategia debe tener tests unitarios.
