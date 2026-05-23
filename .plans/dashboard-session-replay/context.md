# Context: Dashboard Session Replay + TUI Widget

## Vision

Cuando el usuario activa Lion en Pi, debe ver en el TUI un widget con el enlace al dashboard. Al abrir el dashboard, debe poder ver:
1. El estado actual del orchestrador (plan, task, run, subagents)
2. Toda la historia de eventos de la sesion (reconstruida)
3. Eventos en vivo mientras Lion ejecuta

Esto permite "revisar la sesion hija del agente" — ver que hicieron los subagents, cuanto tardaron, que herramientas usaron.

## Estado Actual

- Dashboard funciona con SSE (eventos en vivo)
- LionDashboardBridge enriquece eventos con metadata
- Los eventos de Lion se persisten en `.lion/runs/{runId}.events.jsonl`
- Los eventos de subagent NO se persisten (van directo al dashboard via SubAgentEventBus)
- No hay widget de dashboard en el TUI
- No hay reconstruccion de sesion al abrir el dashboard

## Arquitectura Propuesta

```
Pi TUI
├── Lion activado
│   ├── Widget: "Dashboard: http://localhost:9393"  (click para abrir)
│   └── Widget: "Lion subagents" (ya existe)
│
└── Session file (.jsonl)
    ├── custom entry: lion-state
    ├── custom entry: lion-core
    └── custom entry: lion-dashboard-event  (NUEVO)

Dashboard Server
├── /api/dashboard/events/stream     → SSE (eventos en vivo)
├── /api/dashboard/session/rebuild   → POST (reconstruye desde session file)
├── /api/dashboard/session/state     → GET (estado actual del LionRuntime)
└── /api/dashboard/runs/{runId}      → GET (eventos de un run especifico)

Dashboard Frontend (Zustand)
├── Estado Global
│   ├── lionState: LionDashboardState
│   ├── events: DashboardEventPayload[]  (historial + en vivo)
│   ├── runs: Map<runId, RunEvents>
│   └── live: boolean  (conectado a SSE?)
│
├── Acciones
│   ├── hydrate()      → fetch /session/rebuild
│   ├── reconcile()    → mergear estado historico con actual
│   ├── sync()         → suscribirse a SSE
│   └── appendEvent()  → agregar evento en vivo
│
└── UI
    ├── OrchestratorPanel  → estado actual
    ├── EventLog           → timeline de eventos
    ├── RunSelector        → elegir run historico
    └── SubagentDetail     → ver detalle de un subagent
```

## Persistencia de Eventos

Cada evento que pasa por `LionDashboardBridge` se guarda como `custom` entry en la session de Pi:

```typescript
// En el SessionManager de Pi
pi.appendEntry("lion-dashboard-event", {
  timestamp: Date.now(),
  event: enrichedEvent,  // DashboardEventPayload
});
```

Esto permite reconstruir la sesion completa leyendo el archivo `.jsonl` de la session.

Alternativa (mas simple): persistir en archivo separado `.lion/dashboard/events.jsonl`.

## Decisiones

### A. Donde persistir eventos
- **Opcion 1**: En la session de Pi (como custom entries) — integrado, pero mas I/O
- **Opcion 2**: En archivo separado `.lion/dashboard/events.jsonl` — simple, independiente
- **Recomendacion**: Opcion 2 para empezar, migrar a Opcion 1 si se necesita integracion con session replay de Pi

### B. Formato de eventos persistidos
- Guardar `DashboardEventPayload` completo (con metadata enriquecida)
- Un evento por linea (JSONL)
- Rotar archivo cuando exceda N MB

### C. Reconstruccion
- Leer archivo JSONL completo al abrir dashboard
- Reconstruir `LionDashboardState` desde eventos (no desde LionRuntime)
- Esto permite ver la sesion incluso si Pi no esta corriendo
