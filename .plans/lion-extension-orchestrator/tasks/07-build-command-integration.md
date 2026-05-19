# T-007 Build Command Integration

## Objective

Implement `/lion-build` end to end using the active plan, structured plan loader, linear pipeline strategy, sub-agent adapter, and checklist completion update.

## Requirements Covered

- `FR-005`
- `FR-006`
- `FR-007`
- `FR-009`
- `FR-010`

## Dependencies

- `T-002`
- `T-003`
- `T-005`
- `T-006`

## Files or Areas Involved

- `packages/extensions/src/extensions/lion/commands.ts` — Modify — Implement `/lion-build` handler.
- `packages/extensions/src/extensions/lion/state.ts` — Modify — Track active task and last build result.
- `packages/extensions/src/extensions/lion/persistence.ts` — Modify — Persist state around build transitions.
- `packages/extensions/src/extensions/lion/plans/checklist.ts` — Use — Mark task complete after approval.
- `packages/extensions/src/extensions/lion/strategies/linear-pipeline.ts` — Use — Execute pipeline.
- `packages/extensions/src/extensions/lion/subagents/*` — Use — Run delegations.
- `packages/extensions/src/extensions/lion/ui.ts` — Modify — Report build progress/result.

## Expected Outcome

- `/lion-build` fails with a clear message if no plan is active.
- `/lion-build` loads the active structured plan and selects the next pending unblocked task.
- `/lion-build` runs the selected task through the executor/reviewer pipeline.
- Approved task is marked complete in `checklist.json`.
- Rejected/failing task is not marked complete.
- Parent thread receives a concise final summary after the pipeline concludes.

## Context to Preserve

- Parent thread still does not implement code directly.
- V1 executes only the next task, not the entire plan, unless requirements are changed.
- Build should be explicit; activation alone never builds.

## Constraints

- Do not silently continue to additional tasks after one task completes.
- Do not treat reviewer failures or missing verdict as success.
- Do not modify plan files other than checklist status updates required by approved build completion.

## Completion Criteria

- [ ] `/lion-build` is registered and connected to the pipeline.
- [ ] No-active-plan path returns clear guidance.
- [ ] No-pending-task path returns clear completion message.
- [ ] Approved build marks exactly the selected task complete.
- [ ] Failed/rejected build records last result and leaves checklist task incomplete.
- [ ] Final command output includes task ID, attempts, executor summary, reviewer summary, and next suggested action.

## Validation

```bash
npm run check
```

Manual validation once runnable:

```text
/lion-activate .plans/lion-extension-orchestrator
/lion-build
```

## Expected Final Report

- End-to-end flow implemented.
- Checklist update behavior.
- Validation result.
- Remaining manual testing gaps.

## Risks or Notes

- Running real sub-agents can be expensive or environment-dependent. Prefer isolated/fake runner tests for strategy and careful manual validation for integration.
