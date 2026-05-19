# Feature Index Template

Use this structure for `.plans/<initiative-name>-overview/feature-index.md` in
`initiative-overview` mode.

```markdown
# [Initiative Title] Feature Index

## Summary

- Mode: Initiative Overview
- Slug: `[initiative-name]-overview`
- Feature Briefs Directory: `features/`
- Living Map: `living-map.md`
- Dependency Graph: `dependency-graph.md`
- Worktree Strategy: `worktrees.md`

## Feature List

| Feature ID | Type | Brief File | Goal | Suggested Plan Mode | Dependencies | Parallelizable | Status | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `F-001` | implementation | `features/F-001-domain-foundation.md` | [goal] | `structured` | none | no | planned | [team] |
| `F-002` | investigation | `features/F-002-api-contracts.md` | [goal] | `simple` | `F-001` | no | planned | [team] |
| `F-003` | implementation | `features/F-003-frontend-shell.md` | [goal] | `simple` | `F-002` | yes | planned | [team] |

## Suggested Execution Waves

1. **Wave 1 - Foundation**: `F-001`
2. **Wave 2 - Core Build**: `F-002`
3. **Wave 3 - Parallel Branches**: `F-003`, `F-004`
4. **Wave 4 - Integration**: `F-005`

## Change Log (for refreshes)

- Added: [feature IDs]
- Removed: [feature IDs]
- Split: [old ID -> new IDs]
- Merged: [old IDs -> new ID]
- Adjusted from feedback: [feature IDs and reason]

## Follow-up Commands

- `/plan .plans/<initiative-name>-overview/features/F-001-<slug>.md`
- `/plan .plans/<initiative-name>-overview/features/F-002-<slug>.md`
```

Notes:

- Keep this file as the navigation layer for feature-level planning.
- Keep feature IDs stable across refreshes unless decomposition materially changes.
- Preserve `Status` and `Owner` values on refresh unless the user requests edits.
