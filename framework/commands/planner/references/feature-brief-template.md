# Feature Brief Template

Use this structure for each file in
`.plans/<initiative-name>-overview/features/F-00X-<feature-slug>.md`.

```markdown
# [Feature ID] [Feature Title]

## Objective

[One-paragraph technical objective for this feature planning unit.]

## Feature Type

- Type: implementation | investigation | validation | correction | integration

## Scope Boundaries

- In scope: [items]
- Out of scope: [items]

## Verified Context

- [fact confirmed in code/docs]

## Assumptions

- [explicit assumption]

## Unknowns

- [open point requiring confirmation]

## Investigation Questions

- [question the receiving agent should answer before implementation, if relevant]

## Likely Files or Areas Involved

- `path/to/file-or-dir` - Create | Modify | Review - [why it matters]

## Feature Dependencies

- Depends on: [feature IDs or none]
- Blocks: [feature IDs or none]

## Human-Owned Tracking Fields

- Status: [planned | in_progress | blocked | done]
- Owner: [name or team]
- Decision Notes: [human decisions to preserve across refreshes]
- Manual Overrides: [explicit overrides that should not be auto-rewritten]

## Parallelization Notes

- Parallelizable: [yes/no]
- Reason: [why this can or cannot run in parallel]

## Worktree Recommendation

- Recommended: [yes/no]
- Suggested branch: `feature/<initiative>-<feature-slug>`
- Suggested worktree path: `../wt-<initiative>-<feature-slug>`

## Suggested `/plan` Mode

- Mode: `simple` or `structured`
- Rationale: [why]

## Suggested Delegation Skill

- Required skill: `feature-executor`
- Rationale: [why this feature is suitable for an execution agent]

## Suggested Next Command

- `/plan .plans/<initiative-name>-overview/features/F-00X-<feature-slug>.md`
```

Notes:

- Keep this brief planning-oriented and codebase-grounded.
- Do not add implementation task breakdown here; `/plan` will do that later.
- Keep feature ID and slug stable unless intent materially changes.
- Preserve the human-owned tracking fields during refresh unless the user asks to change them.
