---
description: >
  Create a technical implementation plan using an analysis-first workflow and
  save it under `.plans/` without touching application code. Supports both a
  single markdown plan and a structured plan folder with requirements and task
  files. Also supports reading an existing feature brief markdown file under
  `.plans/` as input context. Use when you need a durable plan before
  implementing. Triggers: plan, planning, technical plan, implementation plan,
  roadmap, execution plan.
---

# Technical Planning

Load the `planner` skill and create a durable technical plan for:

`$ARGUMENTS`

## Mission

Produce a plan only. Do not implement code.

The final artifacts must live under `.plans/`. If `.plans/` does not exist,
create it before writing.

## Input Resolution

Interpret `$ARGUMENTS` using this order:

1. If `$ARGUMENTS` is a path to an existing `.md` file under `.plans/`, read it
   as planning input context and synthesize a new plan from that brief.
2. Otherwise, treat `$ARGUMENTS` as a natural-language request and analyze the
   codebase as usual.

When a brief path is provided, keep the same output contract: produce either a
`simple` or `structured` implementation plan. Do not generate an
initiative-level overview in this command.

## Workflow

Follow the `planner` skill strategy (`references/planning-strategy.md`) end to
end. The skill defines the full analysis, clarification, mode selection,
synthesis, and quality gate workflow.

Key command-level constraints:

- Do not write plan artifacts before completing analysis and clarification.
- Do not stop for intermediate approval. Once the scope is clear, write the
  artifacts directly.
- If the request is ambiguous, ask only the minimum clarifying questions needed.
- If the task is broad or cross-domain, delegate discovery to the `analyzer`
  agent, then convert findings into the plan.
- In structured mode, always include `context.md` as the first artifact so any
  agent can restore full context when executing a task.
- Maintain backward compatibility: `/plan` without an explicit brief path must
  preserve existing behavior.

## Plan Modes

`/plan` is durable by design. Do not emit non-durable `/task` output here.

Choose `simple` by default when the request is small, localized, or leads to a
single execution unit.

Choose `structured` only when the investigation confirms multiple durable
execution units that justify separate requirements and task artifacts.

### Simple mode artifacts

- `.plans/<plan-name>.md`

### Structured mode artifacts

- `.plans/<plan-name>/context.md`
- `.plans/<plan-name>/requirements.md`
- `.plans/<plan-name>/task-index.md`
- `.plans/<plan-name>/tasks/*.md`
- `.plans/<plan-name>/checklist.json`
- `./planner-checklist.js` (project-local CLI, refreshed from the planner skill)

## After Planning

Summarize what was created and point to the resulting paths.

---
**Remember**: This command is for planning only. Use `/build` for simple plans or `/build-plan` for structured plans after the plan exists and you are ready to execute it.
