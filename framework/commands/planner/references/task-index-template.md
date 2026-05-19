# Task Index Template

Use this structure for `.plans/<plan-name>/task-index.md` in structured mode.

```markdown
# [Plan Title] Task Index

## Summary

- Mode: Structured
- Slug: `[plan-name]`
- Requirements File: `requirements.md`
- Checklist File: `checklist.json`

## Requirements Coverage

| Requirement | Covered By |
| --- | --- |
| `FR-001` | `tasks/01-auth-contract-compatibility.md` |
| `FR-002` | `tasks/02-checkout-renewal-validation.md` |

## Task List

| Task ID | File | Purpose | Dependencies |
| --- | --- | --- | --- |
| `T-001` | `tasks/01-auth-contract-compatibility.md` | [outcome this delegated work unit must achieve] | none |
| `T-002` | `tasks/02-checkout-renewal-validation.md` | [outcome this delegated work unit must achieve] | `T-001` |

## Suggested Execution Order

1. `T-001` - [reason]
2. `T-002` - [reason]
3. `T-003` - [reason]

## Notes

- [important dependency or sequencing note]
```

Notes:

- Treat this file as the navigation layer for the structured plan.
- Keep it synchronized with the task files and requirement IDs.
- Use task names and purposes that describe outcomes, not mechanical steps.
- Write it so an execution command such as `/build-plan` can derive ordering and validation from it.
