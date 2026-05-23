# Context: Lion + Dashboard Integration

## Estado Actual

El dashboard (`packages/dashboard`) ya esta implementado y funciona:
- `DashboardDaemon` inicia un servidor HTTP con oRPC
- `EventBridge` subscribe a `TypedEventBus` y forwarda eventos via SSE
- Frontend React muestra eventos en tiempo real con filtros

La integracion con Lion (`packages/extensions/src/extensions/lion`) ya esta **parcialmente** hecha:
- `index.ts` crea `DashboardDaemon`, lo guarda en `runtime.dashboard`
- `index.ts` bridgea `runtime.events` (LionEventBus) en `session_start`
- `tools.ts` bridgea `controller.getEventBus()` (SubAgentEventBus) cuando se crea un controller
- Comando `/dashboard` inicia el servidor

## Problemas Identificados

### 1. Duplicacion de SubAgent Events (CRITICO)

Cada evento de subagent llega **dos veces** al dashboard:

```
SubAgentController
├── SubAgentEventBus ──bridge──► Dashboard (source: "subagent")
│
└── onEvent callback ──emit──► LionEventBus
                              └── lion.subagent.event ──bridge──► Dashboard (source: "lion")
```

El `createLionSubAgentController` recibe un `onEvent` callback que emite `lion.subagent.event` al LionEventBus. Pero el dashboard ya bridgea directamente el `SubAgentEventBus` del controller. Resultado: duplicados.

### 2. Inconsistencia de Tipos de Eventos

El `LionEventBus` tiene **dual API**:
- **Nueva**: `publish(creator, payload)` → crea TypedEvent → aplana a LionEvent → `emit()`
- **Vieja**: `emit(event)` y `on(type, listener)` — para compatibilidad

Pero el `createLionSubAgentController` usa `options.emit()` (LionEventSink) que emite objetos planos directamente. Esto funciona porque `emit()` sigue existiendo, pero:
- Los eventos emitidos via `emit()` no tienen `id` ni estructura TypedEvent
- El `EventBridge` del dashboard espera `TypedEvent` con `.id`, `.type`, `.payload`, `.timestamp`
- Cuando recibe un `LionEvent` plano, hace un fallback: `id: "${type}-${timestamp}"`

### 3. Falta de Metadata Contextual en Dashboard

Los eventos del dashboard solo ven:
```json
{ "type": "lion.build.start", "source": "lion", "payload": { "runId": "..." } }
```

No hay informacion de:
- Plan activo (slug, path)
- Task actual (id, title)
- Estado del run (executing, reviewing, etc.)
- Lista de subagents activos

El dashboard muestra un log de eventos crudo, pero no tiene "vista de alto nivel" del estado del orchestrator.

### 4. Eventos de SubAgent no tienen metadata de Lion

Cuando un subagent emite `task.start`, el dashboard lo ve como:
```json
{ "type": "task.start", "source": "subagent", "payload": { "instanceId": "...", "taskId": "..." } }
```

No sabe a que run, plan o task de Lion pertenece ese subagent.

## Objetivo

1. Eliminar duplicacion de subagent events
2. Enriquecer eventos con metadata contextual (plan, task, run)
3. Exponer estado del orchestrador en el dashboard (no solo eventos)
4. Mantener compatibilidad con codigo existente

## Arquitectura Propuesta

```
LionRuntime
├── events: LionEventBus ───────bridge──────► Dashboard (orchestrator events)
│
├── controllers: Map<runId, SubAgentController>
│   └── SubAgentEventBus ──────bridge──────► Dashboard (raw subagent events)
│
└── dashboard: DashboardDaemon
    ├── EventBridge (unificado)
    │   ├── recibe LionEvent (planos) → enriquece con metadata
    │   └── recibe SubAgentEvent → enriquece con metadata de Lion
    ├── StateSnapshot (nuevo)
    │   ├── activePlan, activeTask, runStatus
    │   └── subagentJobs[] con estado actual
    └── oRPC Router
        ├── dashboard.state.get → StateSnapshot
        └── dashboard.events.stream → EventIterator enriquecido
```

## Decisiones de Diseno

### A. Eliminacion de Duplicados

**Opcion 1**: No bridgear SubAgentEventBus directamente. Solo bridgear LionEventBus, y dejar que `lion.subagent.event` sea la unica fuente de subagent events.

**Opcion 2**: Bridgear ambos pero deduplicar en el EventBridge usando `id` + `timestamp`.

**Opcion 3**: Enriquecer SubAgentEventBus con metadata Lion antes de bridgear, y no emitir `lion.subagent.event`.

Recomendacion: **Opcion 3** como arquitectura final. El `createLionSubAgentController` ya no emite `lion.subagent.event`. En vez, el dashboard enriquece los SubAgentEvents con metadata Lion (runId, planSlug, taskId) antes de publicarlos.

Secuencia segura de migracion:
1. Quitar el bridge directo actual de `SubAgentEventBus` para cortar la duplicacion inmediata, manteniendo `lion.subagent.event` como fuente temporal.
2. Introducir `LionDashboardBridge` y registrar cada `SubAgentController` nuevo con metadata Lion.
3. Reemplazar el bridge generico de `runtime.events` por `LionDashboardBridge`.
4. Desactivar la emision de `lion.subagent.event` solo despues de que el bridge enriquecido ya reciba eventos de subagent.

No debe existir un estado final donde el dashboard reciba simultaneamente `SubAgentEventBus` enriquecido y `lion.subagent.event` para el mismo evento.

### B. Enriquecimiento de Eventos

Crear un `LionDashboardBridge` que:
1. Recibe eventos de LionEventBus y SubAgentEventBus
2. Mantiene referencia al `LionRuntime` para obtener metadata
3. Enriquece cada evento con: `runId`, `planSlug`, `planPath`, `taskId`, `attempt`
4. Publica eventos enriquecidos al `DashboardEventBridge`

Los controllers se crean dinamicamente. Por eso el bridge debe exponer un metodo explicito de registro, por ejemplo `registerController(runId, taskId, controller)`, y el codigo que crea controllers debe llamarlo inmediatamente despues de crear el controller. No depender de recorrer periodicamente `runtime.controllers`.

### C. State Snapshot

Agregar endpoint `dashboard.state.get` que devuelva:
```typescript
interface LionDashboardState {
  activePlan: { slug: string; path: string } | null;
  activeTask: { id: string; title: string } | null;
  activeRun: { runId: string; status: string; attempt: number } | null;
  subagents: Array<{
    taskId: string;
    role: string;
    status: string;
    turnCount: number;
    currentTool: string | null;
  }>;
  recentEvents: DashboardEventPayload[];
}
```

## Out of Scope

- Autenticacion del dashboard
- Persistencia de estado del dashboard
- Multiple instancias de dashboard
- Edicion de estado desde el dashboard (solo lectura)
