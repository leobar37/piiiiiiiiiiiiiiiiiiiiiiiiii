# Task Index: Lion + Dashboard Integration

## Plan

- **Slug**: lion-dashboard-integration
- **Mode**: structured
- **Phases**: fix → bridge → enrich → frontend → verify

## Tasks

| ID | Title | Phase | Dependencies | Requirements |
|---|---|---|---|---|
| T-001 | Eliminar bridge directo duplicado | fix | — | FR-001 |
| T-002 | Crear `LionDashboardBridge` | bridge | T-001 | FR-002, FR-004 |
| T-003 | Enriquecer `dashboard.state.get` | enrich | T-002 | FR-003 |
| T-004 | Deprecar `lion.subagent.event` | bridge | T-002 | FR-005 |
| T-005 | Frontend: Panel de Orchestrator | frontend | T-003 | FR-006 |
| T-006 | Frontend: Enriquecimiento visual | frontend | T-005 | FR-007 |
| T-007 | Tests y verificacion | verify | T-004, T-006 | NFR-001, NFR-004 |

## Phases

1. **fix**: Quitar el bridge directo que causa duplicacion inmediata, manteniendo `lion.subagent.event` como fuente temporal
2. **bridge**: Crear el bridge enriquecido, registrar controllers dinamicos, y solo despues desactivar `lion.subagent.event`
3. **enrich**: Exponer state snapshot y metadata contextual por `dashboard.state.get`
4. **frontend**: Nuevos componentes para vista de orchestrador
5. **verify**: Tests, check, validacion de no-breaking-changes
