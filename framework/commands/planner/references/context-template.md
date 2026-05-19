# Context Template

Use this structure for `.plans/<plan-name>/context.md` in structured mode.

```markdown
# [Plan Title] Context

## Overview

[General summary of what is being done and why. An agent reading only this file
should understand the full purpose of the plan and how all tasks connect.]

## Background

[What motivated this work. Relevant business or technical context.]

## Goal

[Expected outcome when all tasks are complete.]

## Key Decisions

- [Architectural or product decision made during planning]

## Scope Boundaries

- In scope: [items]
- Out of scope: [items]
```

Notes:

- This file is the first thing an agent should read when executing any task from
  the plan.
- Keep it concise but complete enough to restore context without reading every
  task file.
- Update it if the plan scope changes materially during execution.
- Do not include implementation details; those belong in the task files.
