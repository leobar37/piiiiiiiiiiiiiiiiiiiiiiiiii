# Initiative Context Template

Use this structure for `.plans/<initiative-name>-overview/context.md` in
`initiative-overview` mode.

```markdown
# [Initiative Title] Overview Context

## Overview

[High-level summary of the initiative and why feature-level decomposition is
needed.]

## Background

[Business and technical context that shaped this decomposition.]

## Goal

[Expected outcome once all feature-level plans are completed and implemented.]

## Objective Source

- Explicit arguments: [provided objective or none]
- Inferred from session: [yes/no]
- Evidence used: [conversation intent, inspected files, existing plans, or prior reports]

## Decomposition Rationale

- [Why this initiative was split into multiple features instead of one plan]

## Scope Boundaries

- In scope: [items]
- Out of scope: [items]

## Evidence Buckets

### Verified
- [fact confirmed in code/docs]

### Inferred
- [explicit assumption]

### Unknown
- [open point requiring confirmation]
```

Notes:

- Keep this file strategy-oriented.
- Do not include implementation steps here.
- Keep it concise but complete enough to restore context for any follow-up `/plan` run.
