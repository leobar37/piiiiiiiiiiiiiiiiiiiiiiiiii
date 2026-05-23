# Task Index: Dashboard Session Replay + TUI Widget

## Plan

- **Slug**: dashboard-session-replay
- **Mode**: structured
- **Phases**: widget → persist → replay → frontend

## Tasks

| ID | Title | Phase | Dependencies | Requirements |
|---|---|---|---|---|
| T-001 | TUI Widget de Dashboard | widget | — | FR-001 |
| T-002 | Persistencia de eventos en LionDashboardBridge | persist | T-001 | FR-002 |
| T-003 | Endpoint /api/dashboard/session/rebuild | replay | T-002 | FR-003 |
| T-004 | Estado global reconciliable en Zustand | replay | T-003 | FR-004 |
| T-005 | Frontend: Run Selector | frontend | T-004 | FR-005 |
| T-006 | Frontend: Session Replay | frontend | T-005 | FR-006 |
| T-007 | Tests y verificacion | verify | T-006 | NFR-001, NFR-003 |

## Phases

1. **widget**: Crear widget en TUI que muestre enlace al dashboard
2. **persist**: Agregar persistencia de eventos en LionDashboardBridge
3. **replay**: Endpoint de reconstruccion + estado reconciliable
4. **frontend**: Run selector + session replay UI
5. **verify**: Tests de reconstruccion, persistencia, reconciliacion
