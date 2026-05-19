# Dependency Graph Template

Use this structure for `.plans/<initiative-name>-overview/dependency-graph.md`
in `initiative-overview` mode.

```markdown
# [Initiative Title] Feature Dependency Graph

## Dependency Rules

- `F-001` must complete before `F-002` and `F-004` start.
- `F-003` and `F-004` can run in parallel after `F-002`.
- `F-005` depends on `F-003` and `F-004`.

## Graph (ASCII)

F-001
  |
F-002
  |\
  | F-004
  |
F-003
  |/
F-005

## Parallelization Analysis

| Feature | Parallelizable | Why |
| --- | --- | --- |
| `F-003` | yes | [isolated ownership boundary]
| `F-004` | yes | [isolated ownership boundary]
| `F-005` | no | [integration dependency]

## Validation Checks

- [ ] No circular dependencies
- [ ] No dependency references to missing feature IDs
- [ ] At least one valid execution order exists
```

Notes:

- Keep dependencies explicit and machine-readable when possible.
- Use stable feature IDs that match files in `features/`.
