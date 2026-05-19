---
description: >
  Create or refresh an initiative-level feature overview for large projects. The
  output slices work into feature briefs with dependencies, parallelization
  candidates, and worktree recommendations under `.plans/<initiative>-overview/`.
  Use when one request should be split into multiple `/plan`-ready feature
  units.
---

# Feature Planning Overview

Load the `planner` skill and create an initiative-level feature overview for:

`$ARGUMENTS`

If `$ARGUMENTS` is empty or too vague, infer the initiative objective from the
current session context, recent user intent, inspected files, and any existing
planning artifacts. Do not fail only because the objective was not passed as a
command argument.

## Mission

Produce an initiative overview only. Do not implement code and do not generate
execution-ready implementation plans for each feature in this command.

The final artifacts must live under `.plans/`. If `.plans/` does not exist,
create it before writing.

## Workflow

Follow the `planner` skill strategy end to end, including analysis and
clarification before writing artifacts.

Key command-level constraints:

- Do not write overview artifacts before analysis and clarification are complete.
- Do not stop for intermediate approval once scope is clear.
- When arguments are missing, reconstruct the objective from session context and
  state the inferred objective, supporting evidence, assumptions, and unknowns.
- If the request is ambiguous, ask only minimum clarifying questions needed.
- If the initiative is broad or cross-domain, delegate discovery to the
  `analyzer` agent, then convert findings into the overview.
- Include investigation-first feature units when key facts must be discovered
  before safe implementation can proceed.
- Do not delegate implementation from this command. Delegation for
  implementation must be emitted as copy-paste handoff text for the user or
  parent orchestrator to run intentionally.
- Never ask whether to launch the next feature from this command. The command
  must output the delegation text only; the user decides where and when to run
  it.
- Keep `/plan` compatibility intact: this command creates feature briefs that
  can be passed to `/plan` only when a separate durable implementation plan is
  explicitly useful. For orchestration, prefer the Coordinator Handoff instead
  of asking sub-agents to write another detailed plan.

## Fallback Rule

If decomposition collapses to one durable feature-sized unit, do not keep the
initiative overview shape.

In that case:

- explain why the overview was not justified
- recommend using `/plan <request>` directly
- only keep an existing overview when the user explicitly asks to preserve it

## Output Shape

Create or refresh this folder:

- `.plans/<initiative>-overview/`

Required artifacts:

- `.plans/<initiative>-overview/context.md`
- `.plans/<initiative>-overview/living-map.md`
- `.plans/<initiative>-overview/feature-index.md`
- `.plans/<initiative>-overview/dependency-graph.md`
- `.plans/<initiative>-overview/worktrees.md`
- `.plans/<initiative>-overview/features/F-00X-<feature-slug>.md`

## Rules for Feature Briefs

Each feature brief must be durable and usable by either `/plan` or the
Coordinator Handoff.

Each file under `features/` must include:

- objective
- type (`implementation`, `investigation`, `validation`, `correction`, or
  `integration`)
- scope boundaries
- verified context
- assumptions
- unknowns or investigation questions when relevant
- likely files or directories involved
- dependencies on other feature IDs
- parallelization notes
- worktree recommendation
- suggested branch/worktree name
- suggested `/plan` mode (`simple` or `structured`) only when extra durable
  planning is useful before implementation

## Refresh Behavior

If the overview folder already exists, refresh it instead of duplicating it.

When refreshing:

- recompute verified context, dependency graph, and parallelization guidance
- update `living-map.md` with new verified knowledge, unknowns, sub-agent
  feedback, and plan adjustments
- preserve human-owned fields exactly (`Status`, `Owner`, `Decision Notes`,
  `Manual Overrides`)
- update auto-managed fields (`Verified Context`, `Likely Files`,
  `Dependencies`, `Parallelization`, `Worktree Recommendation`) from current
  evidence
- keep stable feature IDs when intent has not materially changed
- explicitly mark added, removed, split, or merged features in
  `feature-index.md`

## Dependency Sanity Check

Before finalizing the overview, validate all of the following:

- no circular dependencies between feature IDs
- no dependencies pointing to missing feature IDs
- at least one valid execution order exists
- every non-foundation feature has a justified dependency path or an explicit
  reason for being independent

## After Planning

Summarize what was created. If extra durable implementation planning is useful,
include optional copy-paste `/plan` commands, for example:

- `/plan .plans/<initiative>-overview/features/F-001-<feature-slug>.md`
- `/plan .plans/<initiative>-overview/features/F-002-<feature-slug>.md`

Do not present `/plan` as the default next step when the Coordinator Handoff is
enough to delegate implementation coherently.

Prefer Coordinator Handoff prompts that ask the receiving agent to load the
`feature-executor` skill. Use `subagent-delegation` conventions for the handoff
shape when preparing copy-paste prompts.

Then include a **Coordinator Handoff** section by reading and applying the
planner skill reference:

- `references/orchestrator-handoff-template.md`

Do not duplicate the handoff template in this command. The command should load
the `planner` skill, use the reference as the source of truth, and adapt it to
the generated overview. The handoff replaces the need for a separate
`/orchestrator` command and must remain read-only guidance for the parent
session.

The handoff is output text only. Do not launch implementation sub-agents from
`/plan-features`; the user or parent orchestrator will copy the generated
handoff into the intended execution session. Investigation or exploration may be
delegated during planning, but implementation delegation must remain explicit in
the final output.

The Coordinator Handoff must describe the review loop: after each sub-agent
report, compare the result against the feature brief and living map, classify it
as `accepted`, `needs-correction`, `blocked`, or `plan-invalidated`, and choose
the next delegation accordingly. Do not continue mechanically to the next
feature when feedback reveals drift or invalidates assumptions.

The final response must not end with questions such as "Do you want me to
launch this?", "Should I continue?", or "Do you want F-003 now?". If a next step
is appropriate, provide it as a copy-paste delegation block and stop.

---
**Remember**: This command creates the strategic feature map for large
initiatives and ends with orchestration guidance. Use the Coordinator Handoff
when a parent session will coordinate sub-agents feature by feature. Use `/plan`
only when a feature needs an additional durable implementation plan before
delegation.
