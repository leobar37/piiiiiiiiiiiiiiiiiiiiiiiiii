# T-003 Structured Plan Loader

## Objective

Implement structured plan detection, loading, task selection, and checklist updates for `.plans/<slug>/` folders.

## Requirements Covered

- `FR-003`
- `FR-005`
- `FR-010`
- `NFR-003`
- `NFR-004`

## Dependencies

- `T-001`

## Files or Areas Involved

- `packages/extensions/src/extensions/lion/plans/index.ts` — Create — Public plan module exports.
- `packages/extensions/src/extensions/lion/plans/detect.ts` — Create — Resolve path/slug and detect plan kind.
- `packages/extensions/src/extensions/lion/plans/structured.ts` — Create — Load structured plan files.
- `packages/extensions/src/extensions/lion/plans/checklist.ts` — Create — Parse/update checklist JSON.
- `packages/extensions/src/extensions/lion/plans/task-selection.ts` — Create — Select next pending unblocked task.
- `packages/extensions/src/extensions/lion/plans/overview.ts` — Create — Explicit unsupported/stub handling for v1.
- `packages/extensions/src/extensions/lion/types.ts` — Modify — Refine `LionPlan` and `LionTask` types as needed.

## Expected Outcome

- Lion resolves an input like `.plans/lion-extension-orchestrator` or `lion-extension-orchestrator` to a plan folder.
- Lion detects `structured` plans by required files such as `checklist.json`, `task-index.md`, and `tasks/`.
- Lion loads checklist tasks into normalized `LionTask` objects.
- Lion selects the next pending task whose dependencies are complete.
- Lion can read a task brief by task ID.
- Lion can mark a task complete after approval while preserving unrelated checklist fields.

## Context to Preserve

- Existing plan files are the durable source of truth.
- `checklist.json` may vary slightly between plans, so parsing should validate but not assume unnecessary fields.
- Overview plans can be recognized but do not need execution support in v1.

## Constraints

- Do not use external planner skill logic at runtime.
- Do not hardcode one plan slug.
- Do not mark checklist tasks complete from activation mode.
- Do not overwrite full checklist content in a way that discards unknown fields.

## Completion Criteria

- [ ] Plan path resolution supports relative path and slug forms.
- [ ] Structured plan loader returns plan metadata and tasks.
- [ ] Missing/malformed plan files produce actionable errors.
- [ ] Next-task selection honors dependencies.
- [ ] Checklist update can mark a task complete after pipeline approval.
- [ ] Overview plan detection fails gracefully with an unsupported message.

## Validation

```bash
npm run check
```

Manual validation targets:

```text
/lion-activate .plans/lion-extension-orchestrator
/lion-activate lion-extension-orchestrator
```

## Expected Final Report

- Plan formats supported.
- Checklist behavior implemented.
- Known limitations for overview plans.
- Validation result.

## Risks or Notes

- Checklist schemas are not currently standardized across all historical plans. Keep normalization defensive.
