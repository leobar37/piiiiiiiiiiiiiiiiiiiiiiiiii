# Refactor Delegation Template

Use this template when the receiving agent must refactor code while preserving
or intentionally changing a public contract.

```text
Goal:
[Refactor one specific area while preserving or moving toward the final API below.]

Required Skill:
- Load and follow the `feature-executor` skill before starting.

Context:
- Repo root: [absolute repo path]
- Source material: [plan/task/refactor proposal/user request path or summary]
- Current implementation: [files or directories]
- Known consumers: [files, packages, routes, tests, or unknown]
- Dependency notes: [ordering or compatibility constraints]

Objective:
[Concrete refactor outcome expected.]

Final API Contract:
- Public exports: [names and modules]
- Signatures: [functions/classes/hooks/components/routes/CLI commands]
- Input shapes: [types, schemas, payloads, props, args]
- Output shapes: [return values, responses, emitted events, rendered behavior]
- Error behavior: [exceptions, validation errors, status codes, fallback behavior]
- Compatibility expectations: [what must keep working]
- Migration notes: [call sites or data migrations, if any]
- Usage example: [short desired final usage, if useful]

Scope:
- [Included refactor responsibility]
- [Tests, docs, or call sites included]

Non-Goals:
- [Unrelated cleanup]
- [Behavior changes not authorized]
- [Compatibility layers not required]

Implementation Constraints:
- Preserve existing behavior unless the final API contract explicitly changes it.
- Prefer the smallest correct change.
- Do not add backward compatibility code unless required by persisted data,
  shipped behavior, external consumers, or explicit instructions.
- Keep public names stable unless the final API contract says otherwise.

Likely Files:
- [path] - [Create | Modify | Review] - [reason]
- [path] - [Create | Modify | Review] - [reason]

Validation:
Run:
- [exact command]
- [exact focused test or build command]

Expected Final Report:
- Status: completed | partial | blocked | needs-correction
- Delegation ID / Feature ID
- Files changed
- Final API implemented
- Call sites updated
- Behavior preserved or intentionally changed
- Validation results
- Deviations from the proposed API contract
- Remaining risks, blockers, or follow-up work
- Recommended orchestrator action
```

## Refactor-Specific Rules

- Put the final API before implementation guidance so the receiving agent has a
  stable target.
- State unknown API details explicitly instead of inventing them.
- Include examples when they clarify the target better than prose.
- Ask for deviations from the final API in the report so the parent session can
  review tradeoffs deliberately.
