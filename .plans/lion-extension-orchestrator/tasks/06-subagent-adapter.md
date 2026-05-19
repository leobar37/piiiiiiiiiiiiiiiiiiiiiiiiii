# T-006 Subagent Adapter

## Objective

Integrate `packages/subagents` behind Lion-specific delegation helpers for executor and reviewer runs, including event bridging into Lion events.

## Requirements Covered

- `FR-006`
- `FR-007`
- `FR-013`

## Dependencies

- `T-001`
- `T-004`

## Files or Areas Involved

- `packages/extensions/src/extensions/lion/subagents/index.ts` — Create — Public subagent adapter exports.
- `packages/extensions/src/extensions/lion/subagents/controller.ts` — Create — Controller construction.
- `packages/extensions/src/extensions/lion/subagents/executor.ts` — Create — Executor `DelegationTask` builder/runner.
- `packages/extensions/src/extensions/lion/subagents/reviewer.ts` — Create — Reviewer `DelegationTask` builder/runner.
- `packages/subagents/src/types.ts` — Possibly modify — Expose parent dependencies if needed.
- `packages/subagents/src/controller.ts` — Possibly modify — Accept or set `authStorage`, `modelRegistry`, `settingsManager`.
- `packages/extensions/package.json` — Possibly modify — Add dependency on `@local/pi-subagents` if workspace wiring requires it.

## Expected Outcome

- Lion can create a `SubAgentController` with built-in executor/reviewer definitions.
- Lion can execute an executor delegation with a task-specific prompt.
- Lion can execute a reviewer delegation with a task-specific prompt.
- Sub-agent events are bridged to `lion.subagent.event` while preserving the original event payload.
- Any required `packages/subagents` API additions are minimal and backwards-compatible for existing callers.

## Context to Preserve

- `packages/subagents` is programmatic and should remain reusable outside Lion.
- Lion should not duplicate sub-agent lifecycle logic.
- Reviewer must not have edit/write tools.
- Executor may edit and execute according to its built-in definition and task-specific restrictions.

## Constraints

- No inline imports.
- Avoid weakening `packages/subagents` types.
- Do not bypass the existing `SubAgentController` unless an inspected API blocker requires it.
- Do not introduce real provider/API-key assumptions into tests.

## Completion Criteria

- [ ] Lion subagent adapter can construct executor and reviewer delegations.
- [ ] Executor delegation uses definition `executor`.
- [ ] Reviewer delegation uses definition `reviewer`.
- [ ] Reviewer remains read/execute only and cannot edit files.
- [ ] Sub-agent events are forwarded into Lion's event stream.
- [ ] Any `packages/subagents` public API change is documented in code and remains type-safe.

## Validation

```bash
npm run check
```

If subagent package tests are created or modified, run the specific test file from the package root as required by repository rules.

## Expected Final Report

- Sub-agent adapter behavior.
- Any `packages/subagents` API changes.
- Validation result.
- Known runtime assumptions.

## Risks or Notes

- The current controller has private parent dependency fields but does not expose options for all of them. This may be the main integration blocker.
