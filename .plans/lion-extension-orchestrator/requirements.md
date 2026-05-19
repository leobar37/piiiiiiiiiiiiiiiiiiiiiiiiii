# Lion Extension Orchestrator — Requirements

## Objective

Build a `lion` extension that lets a Pi session activate planning/orchestration mode for one active plan and execute that plan through a delegated executor/reviewer pipeline, with internal prompts, strategies, events, and rule monitoring.

## Scope

In scope:

- Create `packages/extensions/src/extensions/lion` as a stateful extension.
- Register `/lion-activate [plan-path-or-slug]`.
- Register `/lion-build`.
- Maintain one active plan in persisted session state.
- Support structured plan folders in `.plans/<slug>/`.
- Inject Lion planning/orchestration rules into the parent system prompt while active.
- Execute build work only through `packages/subagents` delegations.
- Implement executor -> reviewer -> correction loop.
- Mark a task complete only after reviewer approval.
- Emit and persist standard Lion events.
- Keep prompts and strategies inside the extension.

Out of scope:

- Parallel task execution.
- Worktree-based isolation.
- Multiple active plans.
- Full initiative-overview execution.
- External skill dependency for runtime prompts or strategies.
- Application-code implementation by the parent thread.

## Functional Requirements

- `FR-001` — Lion extension is discoverable by the existing `packages/extensions` build process via `src/extensions/lion/index.ts`.
- `FR-002` — `/lion-activate` without an argument enables planning mode and injects Lion planning/orchestration rules.
- `FR-003` — `/lion-activate <plan>` resolves a structured plan by path or slug, loads it, stores it as active, and summarizes its status.
- `FR-004` — In planning mode, the parent thread is instructed not to implement application code directly and to edit plan files only with explicit user authorization.
- `FR-005` — `/lion-build` requires an active plan and selects the next pending structured-plan task.
- `FR-006` — `/lion-build` delegates implementation to an executor sub-agent instead of implementing in the parent thread.
- `FR-007` — `/lion-build` delegates review to a reviewer sub-agent after executor completion.
- `FR-008` — Reviewer output must include a parseable `LION_REVIEW_STATUS: approved|rejected` verdict.
- `FR-009` — Rejected reviews trigger a correction delegation to the executor with reviewer feedback, up to `maxAttempts`.
- `FR-010` — Approved reviews mark the task complete in the plan checklist.
- `FR-011` — Lion emits orchestration events for activation, plan loading, build start/end, delegation start/end, review verdicts, corrections, task completion, failures, and rule violations.
- `FR-012` — Lion persists each build run event stream as JSONL under `.lion/runs/`.
- `FR-013` — Lion bridges sub-agent events into Lion events without losing the original sub-agent event payload.
- `FR-014` — Lion owns all planning, executor, reviewer, and correction prompts in `prompts/` modules.
- `FR-015` — Lion's implementation is split into single-responsibility modules rather than centralizing logic in `index.ts`.

## Non-Functional Requirements

- `NFR-001` — The extension must remain minimally invasive to existing extension architecture.
- `NFR-002` — Modules should expose small, typed interfaces and avoid circular dependencies.
- `NFR-003` — Plan parsing should fail with actionable errors when required files are missing or malformed.
- `NFR-004` — Checklist updates should preserve unrelated checklist fields where possible.
- `NFR-005` — Event emission should be best-effort and must not crash successful builds because a listener fails.
- `NFR-006` — Rule monitoring should flag process violations without silently converting failures into success.
- `NFR-007` — Runtime prompts must be deterministic and stored in source, not sourced from external skills.
- `NFR-008` — The implementation must pass the repository check command required for code changes: `npm run check`.

## Acceptance Criteria

- `packages/extensions/src/extensions/lion/index.ts` exists and registers both commands.
- `/lion-activate` can activate planning mode with or without an existing plan.
- `/lion-activate .plans/<slug>` loads a structured plan and persists active-plan state.
- The active Lion system prompt states the parent thread may not implement application code directly.
- `/lion-build` executes the next pending task through executor and reviewer sub-agents.
- A rejected review loops back to executor correction with reviewer feedback.
- An approved review marks the task complete in `checklist.json`.
- Lion event JSONL is written for a build run.
- Rule monitor emits violations for invalid state transitions such as marking complete without approval.
- All prompts and strategies are inside `packages/extensions/src/extensions/lion`.
- `npm run check` completes without errors, warnings, or infos introduced by the change.

## Constraints

- Do not depend on planner/framework skills at runtime.
- Do not introduce broad command surface beyond `/lion-activate` and `/lion-build` in v1.
- Do not implement parallelism or worktrees in v1.
- Do not modify already-released package sections in changelogs unless a later implementation task explicitly requires changelog updates.
- Follow repository rules: no `any` unless absolutely necessary, no inline imports, and no direct edits to generated model files.

## Open Questions

- Should `/lion-build` execute only one next pending task or continue through all pending tasks? Current recommended v1 behavior is one task per command.
- Should Lion event logs live in `.lion/runs/` or inside `.plans/<slug>/runs/`?
- Should `packages/subagents` expose parent `authStorage` and `settingsManager` through controller options, or is `modelRegistry` enough for the first version?
- Should structured-plan checklist IDs support both `T-001` and legacy `T1` forms?
- Should `/lion-activate` be allowed to create plan files automatically after one explicit authorization, or require confirmation for each write batch?
