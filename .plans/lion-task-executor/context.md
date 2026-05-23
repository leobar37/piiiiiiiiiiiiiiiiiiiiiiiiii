# Contexto: Sistema de Ejecución de Tareas para Subagentes

## Estado Actual

### packages/subagents

Ya tiene una base sólida:

- **`SubAgentController`** — orquesta instancias de subagentes
- **`SubAgentInstance`** — lifecycle completo (start, pause, resume, cancel, dispose)
- **`executeParallel` / `executeSequential`** — estrategias de ejecución
- **`ExecutionPlan`** — plan con `strategy: "parallel" | "sequential"`
- **Event Bus** — eventos en tiempo real (`lifecycle.change`, `task.start/end`, `turn.complete`, `tool.execute`, `progress.update`, etc.)
- **State tracking** — `SubAgentInstanceState` con `turnCount`, `currentTool`, `startTime`, `endTime`, etc.

### packages/extensions/src/extensions/lion

Tiene:

- **Tools**: `lion_start_next_task`, `lion_start_review`, `lion_validate_plan`, `lion_prompt_subagent`, etc.
- **Event Bus propio** (`LionEventBus`) — wrapper con eventos de dominio Lion
- **UI Widget** — muestra subagentes en ejecución con estado, turns, tools, tiempo
- **Runtime** — `subagentUi`, `subagentJobs`, `retainedInstances`

## Problemas Identificados

1. **Lion tiene lógica de ejecución duplicada** — `runExecutorDelegation`, `runReviewerDelegation`, `runPlanValidatorDelegation` son casi idénticas
2. **No hay abstracción genérica de ejecución** — cada modo (executor, reviewer, validator) tiene su propia función
3. **El orquestador no puede observar en tiempo real** — solo ve resultados al final, no progreso intermedio
4. **No hay tool unificada** — el orquestador debe saber qué tool usar según el contexto
5. **Estrategia "chain" no existe** — solo parallel y sequential, sin pasar output entre pasos

## Visión

### packages/subagents: TaskExecutor

Una clase `TaskExecutor` que encapsule:
- Creación de instancias
- Ejecución con estrategia (parallel/sequential/chain)
- Observabilidad en tiempo real (eventos)
- Control de concurrencia
- Manejo de dependencias entre tareas

### packages/extensions/lion: lion_tasks

Una sola tool `lion_tasks` que:
- Reciba un array de tareas con estrategia
- Permita parallel, sequential, chain
- Retorne instancias retenidas para follow-up
- Integre con el sistema de eventos y UI existente

## Casos de Uso

| Escenario | Estrategia | Descripción |
|-----------|-----------|-------------|
| Análisis multi-ángulo | `parallel` | 3 analizadores en paralelo |
| Pipeline de build | `chain` | Executor → Reviewer (output se pasa) |
| Validación secuencial | `sequential` | Validar partes del plan una por una |
| Build con corrección | `chain` | Executor → Reviewer → Executor (con feedback) |
| Investigación distribuida | `parallel` | 5 researchers investigando diferentes módulos |

## Archivos Clave

### packages/subagents
- `src/types.ts` — Tipos existentes
- `src/controller.ts` — `SubAgentController`
- `src/instance.ts` — `SubAgentInstance`
- `src/execution/parallel.ts` — `executeParallel`
- `src/execution/sequential.ts` — `executeSequential`
- `src/execution/execute.ts` — `execute`
- `src/event-bus.ts` — `SubAgentEventBus`

### packages/extensions/src/extensions/lion
- `tools.ts` — Registro de tools
- `types.ts` — Tipos de Lion
- `runtime.ts` — Runtime y gestión de subagentes
- `core.ts` — Estado del core
- `events/defs.ts` — Definición de eventos
- `subagents/*.ts` — Delegaciones actuales
- `ui/subagents-widget.ts` — Widget de UI
