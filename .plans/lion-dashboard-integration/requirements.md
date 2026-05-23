# Requirements: Lion + Dashboard Integration

## Functional Requirements

### FR-001: Eliminar Duplicacion de SubAgent Events
Solo debe haber **una** fuente de subagent events en el dashboard. Los eventos del SubAgentEventBus deben ser enriquecidos con metadata Lion y no duplicarse con `lion.subagent.event`.

### FR-002: Enriquecer Eventos con Metadata Lion
Cada evento en el dashboard debe incluir contexto:
- `runId`: ID del run activo
- `planSlug`: slug del plan activo
- `planPath`: path del plan activo
- `taskId`: ID del task actual
- `attempt`: numero de intento

### FR-003: State Snapshot del Orchestrator
El endpoint `dashboard.state.get` debe devolver el estado actual del orchestrador:
- Plan activo (slug, path, kind)
- Task activo (id, title, status)
- Run activo (runId, status, attempts)
- Lista de subagents con estado (role, status, turns, tool)

### FR-004: Dashboard Bridge Enriquecido
Crear `LionDashboardBridge` que:
- Recibe `LionRuntime` para acceder a metadata
- Subscribe a `LionEventBus` y `SubAgentEventBus`
- Expone registro explicito para controllers dinamicos (`registerController` o equivalente)
- Enriquece eventos antes de publicarlos al `DashboardEventBridge`
- Mantiene state snapshot actualizado

### FR-005: Deprecar `lion.subagent.event`
Eliminar la emision runtime de `lion.subagent.event` desde `createLionSubAgentController` solo despues de que `LionDashboardBridge` ya reciba eventos del `SubAgentEventBus` registrado. Mantener la definicion del evento para logs historicos salvo auditoria separada. Los subagent events del dashboard se obtienen directamente del `SubAgentEventBus` enriquecido.

### FR-006: Frontend: Vista de Orchestrator
Agregar panel en el frontend que muestre:
- Plan activo
- Task activo con status
- Lista de subagents con estado real-time
- Run history

### FR-007: Frontend: Enriquecimiento Visual
Los eventos en el log deben mostrar:
- Icono/badge del source (lion/subagent)
- Metadata contextual (plan, task, run)
- Color coding por tipo de evento

## Non-Functional Requirements

### NFR-001: Compatibilidad
El codigo existente que usa `LionEventSink` y `emit()` debe seguir funcionando. No breaking changes.

### NFR-002: Performance
El enriquecimiento de eventos no debe agregar mas de 1ms de overhead por evento.

### NFR-003: Memoria
El state snapshot no debe mantener referencias a objetos grandes. Solo datos primitivos.

### NFR-004: Tests
Todos los tests existentes deben seguir pasando. Agregar tests para el nuevo `LionDashboardBridge`.
