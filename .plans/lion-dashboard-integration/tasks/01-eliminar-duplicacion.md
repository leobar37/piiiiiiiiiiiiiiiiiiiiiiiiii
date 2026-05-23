# T-001: Eliminar bridge directo duplicado

**Phase**: fix
**Dependencies**: none
**Requirements**: FR-001

## Problema

Actualmente cada evento de subagent llega **dos veces** al dashboard:

1. Via `SubAgentEventBus` del controller → bridgeado como `source: "subagent"`
2. Via `LionEventBus` como `lion.subagent.event` → bridgeado como `source: "lion"`

El codigo en `tools.ts`:
```typescript
// Linea 701-702: bridgea SubAgentEventBus directamente
if (runtime.dashboard) {
    runtime.dashboard.bridge(controller.getEventBus(), "subagent");
}
```

Y en `subagents/controller.ts`:
```typescript
onEvent: (subagentEvent: SubAgentEvent) => {
    options.emit({
        type: "lion.subagent.event",
        // ...
        subagentEvent,
    });
}
```

## Solucion

Paso temporal seguro: no bridgear `SubAgentEventBus` directamente desde `tools.ts`. Mantener `lion.subagent.event` como fuente unica mientras no exista `LionDashboardBridge`.

La arquitectura final no usa `lion.subagent.event`; ese cambio ocurre en T-004, despues de que T-002 haya registrado controllers en el bridge enriquecido.

### Cambios

1. **Eliminar** el bridgeo directo de SubAgentEventBus en `tools.ts`:
```typescript
// ELIMINAR estas lineas:
if (runtime.dashboard) {
    runtime.dashboard.bridge(controller.getEventBus(), "subagent");
}
```

2. **Mantener temporalmente** el `onEvent` callback en `createLionSubAgentController` que emite `lion.subagent.event` al LionEventBus.

3. El dashboard ya bridgea `runtime.events` (LionEventBus) en `index.ts`, asi que los `lion.subagent.event` llegaran automaticamente.

### Resultado

Cada subagent event llega **una sola vez** al dashboard, via `lion.subagent.event`, hasta que T-002/T-004 migren la fuente final al bridge enriquecido.

## Verificacion

- Correr tests del dashboard: eventos de subagent no deben duplicarse
- Correr tests de lion: ningun test debe romperse
- Manual: iniciar dashboard, correr un run, verificar que cada evento aparece una sola vez
- Confirmar que no se registra todavia el mismo `SubAgentEventBus` desde `LionDashboardBridge` en este paso
