---
name: planner
description: |
  Create technical implementation plans using an analysis-first workflow and
  return either a non-durable single-task brief or a durable plan under
  `.plans/` (simple file, structured folder, or initiative-level overview).
  Use when the user asks to define a task, create a plan, build a roadmap,
  design an implementation strategy, or decompose a large initiative.
  Triggers: plan, planning, technical plan, implementation plan, execution
  plan, roadmap, feature planning, plan-features.
allowed-tools: Read, Write, Edit, Grep, Glob, Agent, TaskCreate, TaskUpdate, TaskList
---

# Planner Skill

Create evidence-based task and plan outputs before any implementation begins.

## Scope

Use this skill when the goal is to produce a technical plan that another command
or developer can execute later, or when a large initiative must be decomposed
into multiple feature-level planning units.

When invoked from an ongoing session and no explicit objective is provided,
infer the objective from the current conversation, recent user intent, inspected
files, and existing `.plans/` artifacts. Ask a clarifying question only when the
available context is insufficient to infer a safe planning target.

When the user asks for a single task definition (non-durable), return one task
brief and pause. Do not write files in that mode.

You may write or update files inside `.plans/`.

In structured mode, you may also create or refresh a project-local helper at:

- `./planner-checklist.js`

You must not modify application source code while planning.

In initiative-overview mode, do not generate execution-ready implementation
plans for each feature. Only generate the strategic decomposition artifacts.

## Core Strategy

Follow this sequence every time:

1. Analyze the request first
2. Discover the impacted codebase areas
3. Read key files and verify patterns
4. Clarify scope when the request is still ambiguous or underspecified
5. Decide whether the output should be `task`, `simple`, `structured`, or `initiative-overview`
6. For `task`, return one concise task brief and pause; for durable modes, write artifacts in `.plans/`
7. Summarize what was produced and where it was saved when applicable

For the full workflow, see `references/planning-strategy.md`.

## Non-Negotiable Rules

- Never jump straight to writing the plan without analysis
- Never write final plan artifacts before completing analysis and clarification
- Never write vague steps without concrete file or directory references
- Never hide uncertainty; capture it under `Open Questions`
- Never modify code files during planning
- Never save the plan with a generic name like `plan.md` or `new-plan.md`
- Never force a large multi-part request into one monolithic markdown file
- Never mix requirements with implementation-specific file edits in structured mode
- Never silently switch `/plan` behavior to an initiative overview without explicit intent

## Naming Rule

Create a specific kebab-case slug from the objective, for example:

- `.plans/add-member-permissions.md`
- `.plans/refactor-checkout-state.md`
- `.plans/integrate-whatsapp-webhooks.md`
- `.plans/customer-portal-redesign/`
- `.plans/multi-tenant-billing/`

Keep the slug short, specific, and stable.

## Analysis Protocol

During analysis, classify information into three buckets:

- `Verified`: confirmed by inspected files or docs
- `Inferred`: strong conclusion based on existing patterns
- `Unknown`: still unclear after investigation

Search using multiple naming conventions and language variants when the feature
name may appear in different forms.

If the request is broad, ambiguous, or cross-domain, you may delegate discovery
to the `analyzer` agent and then convert its findings into a technical plan.

Before choosing the plan mode, build a lightweight planning brief that mirrors
the precision of `/task`:

- summarize the request in concrete terms
- list the likely files or directories involved
- separate `Verified`, `Inferred`, and `Unknown`
- ask only the minimum clarifying questions that are needed to avoid planning the wrong shape

If the plan shape depends on missing product intent or unresolved scope, stop and
ask before proposing artifacts.

## Plan Modes

### `task`

Use a single non-durable task brief when the user wants to define one task
without creating plan files yet.

Output behavior:

- return exactly one task brief in the response
- include objective, scope, files/areas, steps, dependencies, validation, and open questions
- stop with `Ready to proceed?`
- do not write under `.plans/`

### `simple`

Use a single plan file when the task is localized, has limited execution units,
does not need separate requirements and task artifacts, or still resolves to one
durable implementation unit after clarification.

Artifact:

- `.plans/<plan-name>.md`

Use `references/plan-template.md`.

### `structured`

Use a structured plan folder when the request is large, cross-layer, or clearly
benefits from decomposition into durable task files.

Use `structured` only when the investigation has confirmed multiple durable
execution units. Do not use it as a fallback for vague requests.

Artifacts:

- `.plans/<plan-name>/context.md`
- `.plans/<plan-name>/requirements.md`
- `.plans/<plan-name>/task-index.md`
- `.plans/<plan-name>/tasks/*.md`
- `.plans/<plan-name>/checklist.json`

Project-local helper:

- `./planner-checklist.js`

Use these references:

- `references/context-template.md`
- `references/requirements-template.md`
- `references/task-index-template.md`
- `references/task-template.md`
- `references/checklist-template.json`

In structured mode:

- `context.md` captures the general overview so any agent can restore full context
- `requirements.md` captures the what, not the how
- task files must reference requirement IDs such as `FR-001`
- task file names must be declarative outcomes, not generic labels or mechanical steps
- task files must describe what to achieve, what to preserve, and how to
  validate it; do not prescribe step-by-step implementation unless a decision
  is mandatory
- prefer fewer, larger agent-sized tasks over many small tasks; merge work that
  shares one objective, validation path, or review surface
- `checklist.json` acts as the durable execution state for task progress
- `./planner-checklist.js` should exist in the current project root so execution commands can use it without hardcoded global paths
- there should be at least two durable tasks worth tracking independently

If the proposed structured plan collapses to one durable task, switch back to
`simple`.

Split tasks only when there is a real delegation boundary, such as:

- a distinct functional or technical objective
- an independent validation path
- a dependency that should complete before later work starts
- a different risk profile that benefits from isolated review
- a safe parallelization boundary with minimal file overlap

### `initiative-overview`

Use an initiative overview when the request is too large for one implementation
plan and should be split into multiple feature-level briefs that can later be
passed to `/plan` one by one.

Use `initiative-overview` only when the investigation confirms multiple
feature-sized units with meaningful dependency or sequencing relationships.

Artifacts:

- `.plans/<initiative-name>-overview/context.md`
- `.plans/<initiative-name>-overview/living-map.md`
- `.plans/<initiative-name>-overview/feature-index.md`
- `.plans/<initiative-name>-overview/dependency-graph.md`
- `.plans/<initiative-name>-overview/worktrees.md`
- `.plans/<initiative-name>-overview/features/F-00X-<feature-slug>.md`

Use these references:

- `references/initiative-context-template.md`
- `references/living-map-template.md`
- `references/feature-index-template.md`
- `references/dependency-graph-template.md`
- `references/worktrees-template.md`
- `references/feature-brief-template.md`
- `references/orchestrator-handoff-template.md`

In initiative-overview mode:

- treat the overview as a living map, not a closed implementation plan
- include investigation, validation, correction, or integration features when
  they are the safest next units of work
- keep feature IDs stable (for example `F-001`) when intent does not materially change
- represent dependencies between features explicitly
- document which feature branches can run in parallel and why
- include worktree recommendations without creating branches or worktrees automatically
- make each feature brief directly usable as input to `/plan`
- make the final response directly usable by an orchestration parent session:
  include the next unblocked feature or parallel-safe batch, a sub-agent prompt
  scaffold, required skill to load, required validation commands, expected final
  report fields, and review-loop instructions from
  `references/orchestrator-handoff-template.md`
- if there is only one durable feature-sized unit, fall back to `simple` or `structured`

Human-owned fields (must be preserved across refreshes):

- `Status`
- `Owner`
- `Decision Notes`
- `Manual Overrides`

Auto-managed fields (recomputed on refresh):

- `Verified Context`
- `Living Map`
- `Likely Files or Areas Involved`
- `Feature Dependencies`
- `Parallelization Notes`
- `Worktree Recommendation`

If an overview folder already exists:

- refresh it instead of creating duplicates
- update `living-map.md` with verified knowledge, assumptions, unknowns,
  completed delegations, sub-agent feedback, and plan adjustments
- preserve all human-owned fields exactly
- mark added, removed, split, and merged features in `feature-index.md`
- refresh dependency and parallelization guidance from current verified context

## Checklist CLI

The planner skill ships a small Node CLI for checklist operations:

- `skills/planner/scripts/planner-checklist.js`

Treat this CLI as the primary interface for checklist state.

In structured mode, copy or refresh it into the current project root as:

- `./planner-checklist.js`

- Use the CLI to inspect checklist state instead of reading `checklist.json` directly when tracking execution.
- Use the CLI to update task state instead of manually editing checklist contents.
- If you need to understand available commands, run the script with no arguments to see usage.
- Do not read the script itself unless the CLI behavior is unclear or appears broken.

Use it to:

- list all tasks
- list remaining (non-completed) tasks
- list next executable tasks
- mark tasks as `in_progress`, `blocked`, or `completed`
- reset tasks back to `pending`

Example usage:

- `node ./planner-checklist.js`
- `node ./planner-checklist.js list <plan-name>`
- `node ./planner-checklist.js remaining <plan-name>`
- `node ./planner-checklist.js next <plan-name>`
- `node ./planner-checklist.js start <plan-name> T-001`
- `node ./planner-checklist.js reset <plan-name> T-001`

When copied locally, the helper should resolve plans relative to the current
working directory, which should be the project root.

## Direct Write

After analysis, clarification (if needed), and mode selection:

- in `task` mode, return the task brief and stop for approval
- in durable modes, write the selected artifacts directly without intermediate approval

If the request is still ambiguous, ask clarifying questions first.

## Required Output Location

Durable planning artifacts must live under `.plans/`.

In `task` mode, no files are created.

Depending on mode, create either:

- `.plans/<plan-name>.md`
- or `.plans/<plan-name>/...`
- or `.plans/<initiative-name>-overview/...`

If the directory does not exist, create `.plans/` first.

## Quality Gate

Before saving the plan, verify all of the following:

- Chosen mode is justified by the task size and structure
- Objective is explicit
- Scope and non-scope are clear
- Relevant files or directories are listed
- Steps are ordered and actionable
- Dependencies between steps are clear
- Risks and edge cases are documented
- Validation strategy exists
- Open questions are captured instead of guessed

In structured mode, also verify:

- `context.md` provides enough overview for an agent to restore full context
- the scope was clarified enough to avoid guessed task boundaries
- `requirements.md` separates requirements from implementation details
- requirement IDs are stable and readable
- every task traces to one or more requirements
- task file names are declarative and specific
- tasks are agent-sized: large enough to justify context handoff, but still
  focused on one outcome
- task contents emphasize objective, expected outcome, preservation constraints,
  validation, and final report expectations instead of implementation recipes
- there are at least two durable tasks that justify a structured plan
- `checklist.json` matches the task files and dependency graph
- `./planner-checklist.js` exists in the current project root or is created alongside the plan

In initiative-overview mode, also verify:

- the request truly benefits from feature-level decomposition
- every feature brief has objective, scope boundaries, and likely file/area impact
- the living map separates known facts, assumptions, unknowns, feedback, and
  next recommended delegation
- each feature has explicit dependency and parallelization metadata
- the final command response gives a concrete coordinator handoff for the next
  feature or parallel-safe batch without creating a separate `/orchestrator`
  command
- the dependency graph has no unresolved cycles or orphan references
- at least one valid execution order exists from foundation to integration
- worktree recommendations are explicit and non-destructive
- each feature brief can be passed to `/plan` as a direct input
- feature IDs remain stable unless the decomposition materially changed
- human-owned fields remain unchanged during refresh unless the user requested edits

If any of these fail, improve the plan before finishing.

## Deliverable Standard

The saved output must be useful to `/build`, `/build-plan`, `/plan`, or a human
implementer without extra interpretation. The reader should understand what to
change, where to change it, and what to validate before coding starts.

In structured mode, the saved artifacts should also be directly consumable by a
dedicated execution command such as `/build-plan`.

In initiative-overview mode, the saved artifacts should be directly consumable
as the strategic layer before execution, with each feature brief ready for
follow-up via `/plan <feature-brief-path>`.
