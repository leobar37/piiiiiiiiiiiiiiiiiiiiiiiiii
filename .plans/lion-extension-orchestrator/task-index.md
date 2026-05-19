# Lion Extension Orchestrator — Task Index

## Summary

- Mode: Structured
- Slug: `lion-extension-orchestrator`
- Requirements File: `requirements.md`
- Checklist File: `checklist.json`

## Requirements Coverage

| Requirement | Covered By |
| --- | --- |
| `FR-001` | `tasks/01-extension-shell-and-state.md` |
| `FR-002` | `tasks/02-activation-and-planning-mode.md` |
| `FR-003` | `tasks/03-structured-plan-loader.md` |
| `FR-004` | `tasks/02-activation-and-planning-mode.md`, `tasks/04-internal-prompts.md` |
| `FR-005` | `tasks/03-structured-plan-loader.md`, `tasks/07-build-command-integration.md` |
| `FR-006` | `tasks/06-subagent-adapter.md`, `tasks/07-build-command-integration.md` |
| `FR-007` | `tasks/06-subagent-adapter.md`, `tasks/07-build-command-integration.md` |
| `FR-008` | `tasks/04-internal-prompts.md`, `tasks/05-linear-pipeline-strategy.md` |
| `FR-009` | `tasks/05-linear-pipeline-strategy.md`, `tasks/07-build-command-integration.md` |
| `FR-010` | `tasks/03-structured-plan-loader.md`, `tasks/07-build-command-integration.md` |
| `FR-011` | `tasks/08-event-bus-and-rule-monitor.md` |
| `FR-012` | `tasks/08-event-bus-and-rule-monitor.md` |
| `FR-013` | `tasks/06-subagent-adapter.md`, `tasks/08-event-bus-and-rule-monitor.md` |
| `FR-014` | `tasks/04-internal-prompts.md` |
| `FR-015` | `tasks/01-extension-shell-and-state.md` |
| `NFR-001` | `tasks/01-extension-shell-and-state.md`, `tasks/09-validation-and-hardening.md` |
| `NFR-002` | `tasks/01-extension-shell-and-state.md`, `tasks/09-validation-and-hardening.md` |
| `NFR-003` | `tasks/03-structured-plan-loader.md` |
| `NFR-004` | `tasks/03-structured-plan-loader.md` |
| `NFR-005` | `tasks/08-event-bus-and-rule-monitor.md` |
| `NFR-006` | `tasks/08-event-bus-and-rule-monitor.md`, `tasks/09-validation-and-hardening.md` |
| `NFR-007` | `tasks/04-internal-prompts.md` |
| `NFR-008` | `tasks/09-validation-and-hardening.md` |

## Task List

| Task ID | File | Purpose | Dependencies |
| --- | --- | --- | --- |
| `T-001` | `tasks/01-extension-shell-and-state.md` | Create Lion extension shell, state model, persistence, and module boundaries | none |
| `T-002` | `tasks/02-activation-and-planning-mode.md` | Implement `/lion-activate` and planning-mode system prompt injection | `T-001` |
| `T-003` | `tasks/03-structured-plan-loader.md` | Load structured plans, select next tasks, and update checklist safely | `T-001` |
| `T-004` | `tasks/04-internal-prompts.md` | Define internal planning, executor, reviewer, and correction prompts | `T-001` |
| `T-005` | `tasks/05-linear-pipeline-strategy.md` | Implement executor/reviewer/correction strategy and verdict parser | `T-003`, `T-004` |
| `T-006` | `tasks/06-subagent-adapter.md` | Integrate `packages/subagents` with Lion delegation helpers and event bridge | `T-001`, `T-004` |
| `T-007` | `tasks/07-build-command-integration.md` | Implement `/lion-build` using plan loader, pipeline, subagents, and checklist updates | `T-002`, `T-003`, `T-005`, `T-006` |
| `T-008` | `tasks/08-event-bus-and-rule-monitor.md` | Add Lion event bus, event store, subagent event bridge, and rule monitor | `T-001`, `T-005`, `T-006` |
| `T-009` | `tasks/09-validation-and-hardening.md` | Add focused tests or validation coverage, run checks, and harden edge cases | `T-007`, `T-008` |

## Suggested Execution Order

1. `T-001` establishes the extension skeleton and state contracts.
2. `T-002`, `T-003`, and `T-004` can proceed after the shell exists; they define activation behavior, plan loading, and prompts.
3. `T-005` builds the pure strategy layer once plan/task and prompts exist.
4. `T-006` wires the sub-agent library behind a Lion-specific adapter.
5. `T-007` connects `/lion-build` end to end.
6. `T-008` adds durable observability and rule monitoring around the pipeline.
7. `T-009` validates and hardens the integrated behavior.

## Notes

- V1 should execute one next pending task per `/lion-build` invocation unless the user explicitly changes the requirement.
- Keep `overview` plan support as a stub or explicit unsupported path unless implementation cost is low.
- If `packages/subagents` needs controller option changes, include them in `T-006` and validate the existing public API still works.
