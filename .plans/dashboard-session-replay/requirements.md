# Requirements: Dashboard Session Replay + TUI Widget

## Functional Requirements

### FR-001: TUI Widget de Dashboard
Cuando Lion se activa y el dashboard esta corriendo, mostrar un widget en el TUI con:
- URL del dashboard
- Estado de conexion (online/offline)
- Numero de subagents activos
- Click para abrir el dashboard en navegador

### FR-002: Persistencia de Eventos de Dashboard
Cada evento enriquecido que pasa por `LionDashboardBridge` debe persistirse en:
`.lion/dashboard/events.jsonl`

Formato:
```json
{"timestamp": 1234567890, "event": {"id": "...", "type": "...", "source": "...", "payload": {...}, "runId": "...", ...}}
```

### FR-003: Endpoint de Reconstruccion
`POST /api/dashboard/session/rebuild` debe:
1. Leer `.lion/dashboard/events.jsonl`
2. Reconstruir `LionDashboardState` desde eventos
3. Reconstruir lista de eventos historicos
4. Devolver: `{ state: LionDashboardState, events: DashboardEventPayload[], runs: RunSummary[] }`

### FR-004: Estado Global Reconciliable (Zustand)
El store de Zustand debe:
- `hydrate(data)` — cargar estado inicial desde servidor
- `reconcile(partial)` — mergear estado parcial sin perder datos
- `appendEvent(event)` — agregar evento en vivo al historial
- `selectRun(runId)` — cambiar a un run historico
- Mantener estado entre reconexiones

### FR-005: Frontend: Run Selector
Agregar componente que permita:
- Ver lista de runs historicos
- Seleccionar un run para ver sus eventos
- Volver al run actual (en vivo)

### FR-006: Frontend: Session Replay
Al seleccionar un run historico:
- Mostrar eventos de ese run (filtrados)
- Mostrar estado del orchestrador al final del run
- Permitir "play" de eventos (simulacion de tiempo real)

## Non-Functional Requirements

### NFR-001: Performance
- Reconstruccion de sesion debe tardar < 1s para 1000 eventos
- Archivo de eventos debe rotar cuando exceda 10MB
- No bloquear el event loop al escribir eventos

### NFR-002: Compatibilidad
- El dashboard debe funcionar incluso si no hay eventos historicos
- Debe funcionar con o sin Lion activo
- Los eventos en vivo no deben depender de la persistencia

### NFR-003: Testing
- Test de reconstruccion de sesion
- Test de persistencia de eventos
- Test de reconciliacion de estado
