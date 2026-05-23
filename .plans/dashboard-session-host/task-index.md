# Dashboard Session Host — Task Index

## Summary

- Mode: Structured
- Slug: `dashboard-session-host`
- Requirements File: `requirements.md`
- Checklist File: `checklist.json`

## Requirements Coverage

| Requirement | Covered By |
| --- | --- |
| `FR-001` | `tasks/01-session-host-core.md` |
| `FR-002` | `tasks/01-session-host-core.md` |
| `FR-003` | `tasks/01-session-host-core.md` |
| `FR-004` | `tasks/01-session-host-core.md` |
| `FR-005` | `tasks/02-session-router-events.md` |
| `FR-006` | `tasks/02-session-router-events.md` |
| `FR-007` | `tasks/03-orpc-contract.md` |
| `FR-008` | `tasks/01-session-host-core.md` |
| `FR-009` | `tasks/01-session-host-core.md` |
| `FR-010` | `tasks/01-session-host-core.md` |
| `NFR-001` | all tasks |
| `NFR-002` | `tasks/04-backend-tests.md` |
| `NFR-003` | `tasks/02-session-router-events.md` |
| `NFR-004` | `tasks/01-session-host-core.md` |
| `NFR-005` | `tasks/05-documentation.md` |

## Task List

| Task ID | File | Purpose | Dependencies |
| --- | --- | --- | --- |
| `T-001` | `tasks/01-session-host-core.md` | Harden SessionHost and LiveSession with error handling, resource limits, idle cleanup, and disk reconstruction | none |
| `T-002` | `tasks/02-session-router-events.md` | Finalize the oRPC session router, integrate into DashboardDaemon, ensure backward compatibility | `T-001` |
| `T-003` | `tasks/03-orpc-contract.md` | Export a typed oRPC contract from the dashboard package for client consumption | `T-002` |
| `T-004` | `tasks/04-backend-tests.md` | Write backend tests covering session lifecycle, prompting, event streaming, limits, and errors | `T-002` |
| `T-005` | `tasks/05-documentation.md` | Document the server: JSDoc on public APIs, README usage, CHANGELOG entry | `T-002` |

## Suggested Execution Order

1. `T-001` — Foundation: harden the core classes before any routing or testing.
2. `T-002` — Router integration: wire all endpoints into the daemon.
3. `T-003` + `T-004` + `T-005` in parallel — Contract, tests, and docs are independent once the router is stable.

## Notes

- `T-001` and `T-002` must be sequential because the router depends on a solid SessionHost.
- `T-003`, `T-004`, and `T-005` can run in any order (or together) once `T-002` is done.
