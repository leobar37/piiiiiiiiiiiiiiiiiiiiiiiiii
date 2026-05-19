# Worktrees Template

Use this structure for `.plans/<initiative-name>-overview/worktrees.md` in
`initiative-overview` mode.

```markdown
# [Initiative Title] Worktree Recommendations

## Strategy

[Short explanation of how feature dependencies map to worktree usage.]

## Recommended Worktree Matrix

| Feature ID | Recommended | Branch Name | Worktree Path | Rationale |
| --- | --- | --- | --- | --- |
| `F-001` | no | `feature/<initiative>-foundation` | n/a | [high coupling, do in main tree]
| `F-003` | yes | `feature/<initiative>-frontend-shell` | `../wt-<initiative>-frontend-shell` | [parallel-safe scope]
| `F-004` | yes | `feature/<initiative>-permissions` | `../wt-<initiative>-permissions` | [parallel-safe scope]

## Parallel Waves

1. Wave 1 (single tree): `F-001`, `F-002`
2. Wave 2 (parallel worktrees): `F-003`, `F-004`
3. Wave 3 (single tree integration): `F-005`

## Operational Notes

- Recommendations only. Do not create branches/worktrees automatically.
- Keep branch naming predictable and feature-scoped.
- Re-evaluate recommendations when dependencies change.
```

Notes:

- This file should stay non-destructive and advisory.
- Keep branch/worktree naming aligned with repository conventions.
