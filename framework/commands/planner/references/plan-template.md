# Simple Plan Template

Use this exact structure for a simple plan at `.plans/<plan-name>.md`.

```markdown
# [Plan Title]

## Objective

[One paragraph describing the technical outcome.]

## Scope

- In scope: [items]
- Out of scope: [items]

## Verified Context

- [fact confirmed in code or docs]
- [fact confirmed in code or docs]

## Assumptions

- [inference that should stay explicit]

## Files Involved

- `path/to/file-or-dir` - Create | Modify | Review - [why it matters]
- `path/to/file-or-dir` - Create | Modify | Review - [why it matters]

## Ordered Execution Steps

1. **[Step name]**
   - Files: `path/to/file-or-dir`
   - Action: [specific implementation intent]
   - Depends on: [step number or none]

2. **[Step name]**
   - Files: `path/to/file-or-dir`
   - Action: [specific implementation intent]
   - Depends on: [step number or none]

## Risks and Edge Cases

- [risk]
- [edge case]

## Validation Strategy

- [test, lint, typecheck, manual flow, or contract validation]

## Open Questions

- [unknown that still needs confirmation]
```
