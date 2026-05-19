# Task File Template

Use this structure for each file in `.plans/<plan-name>/tasks/*.md`.

Prefer declarative file names such as:

- `01-foundation-setup.md`
- `02-api-contract.md`
- `03-frontend-shell.md`

Avoid generic names such as:

- `task1.md`
- `misc.md`
- `backend-stuff.md`

```markdown
# [Task ID] [Task Title]

## Objective

[Describe the outcome this delegated work unit must achieve. Focus on what
should be true when the task is complete, not the exact implementation path.]

## Requirements Covered

- `FR-001`
- `NFR-001`

## Dependencies

- [task ID or none]

## Files or Areas Involved

- `path/to/file-or-dir` - Likely Create | Modify | Review - [why it matters]

## Expected Outcome

- [observable system or codebase outcome]
- [behavior, contract, or integration that should exist]

## Context to Preserve

- [existing behavior, API, compatibility rule, or user flow that must remain intact]

## Constraints

- [non-goal or boundary]
- [required architectural decision only if already decided]

## Completion Criteria

- [observable completion condition]
- [observable completion condition]

## Validation

- [test, lint, typecheck, contract check, or manual verification]

## Expected Final Report

- Files changed
- How the result maps to the objective
- Behavior preserved
- Validation results
- Remaining risks or blockers

## Risks or Notes

- [important caveat, dependency, or risk]
```

Notes:

- Each task must be an agent-sized work unit, not a microtask or a single mechanical edit.
- Each task must trace to one or more requirement IDs.
- State what to achieve and what to validate; avoid prescribing how to implement it.
- Include likely files as orientation, not as a mandatory edit script.
- Only include implementation decisions when they are required constraints from prior analysis.
- Write each task so an execution command such as `/build-plan` can use it as a clean execution unit.
- Keep the task ID and dependencies stable so they can be mirrored in `checklist.json`.
