# Requirements Template

Use this structure for `.plans/<plan-name>/requirements.md` in structured mode.

```markdown
# [Plan Title] Requirements

## Objective

[One paragraph describing the product or technical outcome.]

## Scope

- In scope: [items]
- Out of scope: [items]

## Functional Requirements

- `FR-001` - [clear behavior or capability]
- `FR-002` - [clear behavior or capability]

## Non-Functional Requirements

- `NFR-001` - [performance, security, accessibility, operational constraint]

## Acceptance Criteria

- [observable outcome]
- [observable outcome]

## Constraints

- [technical or business constraint]

## Open Questions

- [unknown that still needs confirmation]
```

Notes:

- Keep this file focused on the what, not the how.
- Do not reference specific implementation files here.
- Use stable IDs because task files will trace back to them.
