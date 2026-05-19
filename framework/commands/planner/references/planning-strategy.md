# Planning Strategy

Use this workflow to generate reliable technical plans.

## Phase 1 - Request Decomposition

Start by extracting:

- feature or bug name
- user goal
- technical constraints
- expected output
- possible system areas involved

Turn the request into search terms using:

- singular and plural nouns
- camelCase and PascalCase
- snake_case and kebab-case
- English and Spanish variants when relevant

## Phase 2 - Codebase Analysis

Search broadly enough to understand impact, then narrow down to the key files.

Inspect these layers when they are relevant:

- frontend
- backend
- database
- tests
- docs

Do not stop at file names. Read the files that define the feature, data flow,
contracts, validations, or UI entry points.

Capture findings as:

- `Verified`
- `Inferred`
- `Unknown`

If the request spans many layers or is hard to trace, delegate discovery to the
`analyzer` agent and use its report as input for the plan.

## Phase 3 - File Impact Map

List the files and directories that are likely involved.

For each one, note one of:

- `Create`
- `Modify`
- `Review`

If an exact file is unknown, name the smallest reliable directory and explain
why the final file still needs confirmation.

## Phase 4 - Clarification Gate

Before choosing the plan mode, reduce ambiguity with a lightweight interaction
pattern inspired by `/task`.

Produce a short planning brief that includes:

- a concrete request summary
- a preliminary file index
- `Verified`, `Inferred`, and `Unknown` findings
- only the clarifying questions that are truly needed

Ask clarifying questions when:

- the business intent is still ambiguous
- the likely execution units are not yet clear
- the difference between `simple` and `structured` depends on missing details

Do not use ambiguity itself as a reason to choose `structured`.

## Phase 5 - Choose Planning Mode

Decide whether the output should be `task`, `simple`, `structured`, or
`initiative-overview`.

Choose `task` when:

- the user asked to define a task without writing plan artifacts
- a single actionable task brief is enough
- the response should pause for iteration before execution

`task` mode is non-durable and should not write files under `.plans/`.

Choose `simple` when:

- the task is localized
- the execution path is short or mostly linear
- a single durable markdown file is enough
- clarification still points to one durable execution unit

Choose `structured` when:

- the request is large or clearly multi-part
- the work spans multiple layers or subsystems
- requirements and implementation tasks should be separated
- later execution will benefit from durable task files
- two or more agent-sized, outcome-oriented tasks are clearly confirmed

Choose `initiative-overview` when:

- the initiative is too large for one implementation plan
- the work should be split into multiple feature-sized planning units
- feature dependencies or parallel branches need explicit mapping
- worktree strategy would benefit from a feature-level decomposition first
- each feature will be planned later via `/plan <feature-brief>`

If clarification is still required to determine the real task boundaries, ask
for it before choosing the mode.

Do not use `initiative-overview` for requests that collapse to one durable
implementation unit.

## Phase 6 - Plan Synthesis

Write outputs directly after analysis, clarification, and mode selection.

In `task` mode, do not write files. Return exactly one task brief and stop for
approval.

In `simple` mode, write `.plans/<plan-name>.md` using
`references/plan-template.md`.

In `structured` mode, write:

- `.plans/<plan-name>/context.md`
- `.plans/<plan-name>/requirements.md`
- `.plans/<plan-name>/task-index.md`
- `.plans/<plan-name>/tasks/*.md`
- `.plans/<plan-name>/checklist.json`

Also ensure the project-local helper exists:

- `./planner-checklist.js`

The bundled helper source lives at:

- `skills/planner/scripts/planner-checklist.js`

Use these templates:

- `references/context-template.md`
- `references/requirements-template.md`
- `references/task-index-template.md`
- `references/task-template.md`
- `references/checklist-template.json`

In `initiative-overview` mode, write:

- `.plans/<initiative-name>-overview/context.md`
- `.plans/<initiative-name>-overview/feature-index.md`
- `.plans/<initiative-name>-overview/dependency-graph.md`
- `.plans/<initiative-name>-overview/worktrees.md`
- `.plans/<initiative-name>-overview/features/F-00X-<feature-slug>.md`

Use these templates:

- `references/initiative-context-template.md`
- `references/feature-index-template.md`
- `references/dependency-graph-template.md`
- `references/worktrees-template.md`
- `references/feature-brief-template.md`
- `references/orchestrator-handoff-template.md`

Each structured task must include:

- purpose
- files or directories involved
- dependency on earlier steps when applicable
- main risk or note when useful
- expected outcome
- behavior or context to preserve
- validation expectations
- expected final report fields

Avoid low-value filler such as:

- "review codebase"
- "implement backend"
- "make UI changes"

Avoid task definitions that prescribe mechanical implementation steps such as:

- "Create `audio.layer.ts`"
- "Update the import in `index.ts`"
- "Add one test case"

Prefer outcome-oriented tasks such as:

- "Introduce an audio scene layer that preserves existing skip semantics"
- "Add member permission handling across validation, API, and form surfaces"
- "Make checkout renewal validation consistent between backend contracts and frontend errors"

Use likely files as orientation for the implementing agent, not as a mandatory
edit recipe. Include a specific implementation decision only when prior
analysis established it as a constraint.

In structured mode:

- keep `requirements.md` focused on the what, not the how
- assign stable requirement IDs such as `FR-001` and `NFR-001`
- ensure each task file references requirement IDs it covers
- use declarative outcome file names such as `03-api-contract-compatibility.md`
- generate `checklist.json` with task IDs, file paths, statuses, and dependencies
- treat the checklist CLI as the operational interface for task state during execution
- copy or refresh the bundled checklist CLI into the current project root as `./planner-checklist.js`
- expect the helper to resolve plan paths from the project root where it is executed
- confirm that there are at least two independently delegable tasks before
  keeping the structured shape
- merge small tasks that share the same objective, validation path, or review
  surface
- split tasks only on real delegation boundaries: independent objective,
  dependency ordering, validation surface, risk profile, or safe parallelization

If the structured proposal collapses to one durable task, fall back to `simple`.

In initiative-overview mode:

- treat each feature brief as a planning handoff unit, not an implementation task file
- include per-feature objective, scope boundaries, and likely file impact
- include feature dependency IDs and parallelization notes
- include worktree recommendations without creating branches automatically
- prepare a coordinator handoff in the final response so the parent session can
  prompt one sub-agent per next executable feature or parallel-safe batch
- keep feature IDs stable unless decomposition materially changed
- if an overview already exists, refresh it and preserve human-owned fields (`Status`, `Owner`, `Decision Notes`, `Manual Overrides`) exactly
- recompute auto-managed fields (`Verified Context`, `Likely Files`, `Dependencies`, `Parallelization Notes`, `Worktree Recommendation`) from current evidence
- if only one feature remains after clarification, fall back to `simple` or `structured`

## Phase 7 - Save the Plan

Skip this phase for `task` mode.

Persist the result to:

- `.plans/<plan-name>.md`
- or `.plans/<plan-name>/...`
- or `.plans/<initiative-name>-overview/...`

Use a specific slug based on the objective.

Examples:

- `.plans/add-role-based-member-invites.md`
- `.plans/fix-contract-renewal-validation.md`
- `.plans/customer-portal-redesign/`
- `.plans/multi-tenant-billing/`

## Phase 8 - Final Review

Do not finalize the plan unless:

- the plan is grounded in real files or explicit assumptions
- the execution order is clear
- risks are visible
- validation is included
- open questions are separated from verified facts
- the chosen mode is justified

In structured mode, also require:

- `context.md` provides sufficient overview for any agent to understand the full plan
- scope is clarified enough that task boundaries are evidence-based
- requirements are separated from implementation detail
- tasks trace to requirement IDs
- task file names are declarative outcomes
- task decomposition is neither too coarse nor too fragmented
- at least two independently delegable tasks are present
- each task says what to achieve, what to preserve, how to validate, and what
  the implementing agent should report back
- `checklist.json` stays aligned with task IDs, dependencies, and file names
- the checklist can be operated through the CLI without requiring direct JSON inspection
- `./planner-checklist.js` resolves plans relative to the current project root without hardcoded global paths

In initiative-overview mode, also require:

- each feature brief is concrete enough to be used as `/plan` input
- dependency mapping is explicit and internally consistent
- at least one valid execution order exists
- parallelizable features are identified with rationale
- worktree recommendations are practical and non-destructive
- the final response includes a copy-paste sub-agent prompt scaffold for the
  next executable feature, expected final report fields, and review-loop
  instructions for the parent session
- feature IDs remain stable unless split/merge changes are documented
- human-owned fields are preserved during refresh unless the user requested changes
