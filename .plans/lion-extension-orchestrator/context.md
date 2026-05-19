# Lion Extension Orchestrator — Context

## Overview

This plan defines the `lion` extension for `packages/extensions/src/extensions/lion`. Lion is a planning and build orchestration extension for Pi that keeps one active plan, helps create or refine that plan, and executes plan tasks only through delegated sub-agents.

The extension is intentionally not a general skill wrapper. It owns its prompts, strategies, event model, plan parsing, and orchestration rules inside the extension code. It must not depend on external skills to know how to plan, delegate, review, or correct.

## User Intent

The user wants a small command surface:

- `/lion-activate [plan-path-or-slug]` — activate Lion planning/orchestration mode, either by understanding an existing plan or helping create/refine one.
- `/lion-build` — execute the active plan through a controlled delegation pipeline.

When Lion is active, the main thread acts as planner/orchestrator only. It may inspect the repository and plan files. It may edit plan files only after explicit user authorization. It must not implement application code directly. Implementation must happen through sub-agent delegations.

## Current Codebase Facts

- `packages/extensions` builds each `src/extensions/<name>/index.ts` entrypoint into `dist/<name>.js` via `packages/extensions/build.ts`.
- `goal-v2` demonstrates a stateful extension split into `index.ts`, `core.ts`, `types.ts`, `utils.ts`, and `prompts.ts`.
- `goal-v2` persists extension state through session entries and injects system prompt guidance via `before_agent_start`.
- `packages/subagents` is a programmatic library, not an extension command surface.
- `packages/subagents` exports `SubAgentController`, `BUILTIN_DEFINITIONS`, `executorDefinition`, `reviewerDefinition`, `SubAgentEventBus`, `FsArtifactStore`, and related types.
- `SubAgentController` supports executing `DelegationTask`s and emits sub-agent lifecycle/progress events.
- `packages/subagents/src/event-bus.ts` implements a typed pub/sub bus for `SubAgentEvent`.
- `packages/subagents/src/types.ts` already defines delegation, result, lifecycle, event, and artifact contracts.
- `SubAgentController` currently has private fields for `authStorage`, `modelRegistry`, and `settingsManager`, but its public options do not expose all parent-session dependencies needed by an extension integration.

## Plan Format Target

Lion v1 targets structured plan folders under `.plans/<slug>/`:

- `context.md`
- `requirements.md`
- `task-index.md`
- `checklist.json`
- `tasks/*.md`

Overview-style plans with `feature-index.md` and `features/` are useful later but are out of scope for the first build unless needed for compatibility scaffolding.

## Core Decisions

- Command surface is limited to `/lion-activate` and `/lion-build` in v1.
- Lion owns all prompts and strategies internally.
- Lion uses single-responsibility modules instead of a large `index.ts`.
- Lion v1 executes one task at a time, linearly.
- Lion v1 does not use worktrees.
- Lion v1 does not run parallel tasks.
- Build pipeline is executor -> reviewer -> correction loop.
- Reviewer must emit a machine-parseable verdict line.
- A task is marked complete only after reviewer approval.
- Events are first-class and persisted so the process can be audited.

## Proposed Extension Structure

```text
packages/extensions/src/extensions/lion/
├── index.ts
├── types.ts
├── state.ts
├── commands.ts
├── persistence.ts
├── ui.ts
├── utils.ts
├── plans/
│   ├── index.ts
│   ├── detect.ts
│   ├── structured.ts
│   ├── overview.ts
│   ├── checklist.ts
│   └── task-selection.ts
├── prompts/
│   ├── index.ts
│   ├── planning.ts
│   ├── executor.ts
│   ├── reviewer.ts
│   └── correction.ts
├── strategies/
│   ├── index.ts
│   ├── linear-pipeline.ts
│   └── review-verdict.ts
├── subagents/
│   ├── index.ts
│   ├── controller.ts
│   ├── executor.ts
│   └── reviewer.ts
└── events/
    ├── index.ts
    ├── bus.ts
    ├── types.ts
    ├── store.ts
    └── rule-monitor.ts
```

## Architectural Layers

### Extension Shell

`index.ts`, `commands.ts`, `ui.ts`, and `persistence.ts` integrate with Pi extension APIs. They should stay thin and delegate domain work to dedicated modules.

### Plan Domain

`plans/*` owns plan detection, loading, structured checklist parsing, task selection, and durable status updates.

### Prompt Domain

`prompts/*` owns every instruction Lion gives to the parent agent or sub-agents. No external skill prompt should be required at runtime.

### Strategy Domain

`strategies/*` owns the build pipeline and verdict parsing. The initial strategy is linear, but this layer should allow future configurable strategies.

### Sub-Agent Adapter

`subagents/*` adapts `packages/subagents` to Lion's pipeline. It should not contain plan parsing or prompt text.

### Event Domain

`events/*` owns Lion orchestration events, durable event storage, and process rule monitoring.

## Event Model Direction

Lion should have its own event bus with events such as:

- `lion.activate.start`
- `lion.activate.complete`
- `lion.plan.loaded`
- `lion.mode.changed`
- `lion.build.start`
- `lion.task.selected`
- `lion.delegation.prompt.created`
- `lion.delegation.start`
- `lion.delegation.end`
- `lion.review.verdict`
- `lion.correction.requested`
- `lion.task.approved`
- `lion.task.rejected`
- `lion.task.marked_complete`
- `lion.build.complete`
- `lion.build.failed`
- `lion.rule.violation`
- `lion.subagent.event`

These events should be written as JSONL under `.lion/runs/<runId>.events.jsonl` so build sessions can be audited without relying on chat transcript memory.

## Risks

- Sub-agent integration may require small changes to `packages/subagents` options to pass parent session dependencies cleanly.
- Updating `checklist.json` directly must preserve user changes and should be atomic enough to avoid corruption.
- Reviewer verdict parsing can be brittle if the prompt does not require an exact line.
- The main-thread non-implementation rule is a behavioral guard; event/rule monitoring can detect process drift but cannot fully prevent every manual action.
- Running sub-agents from an extension can expose assumptions about cwd, model selection, auth storage, and settings.

## Out Of Scope For V1

- Parallel execution.
- Worktree management.
- Multiple active plans.
- Multiple active tasks.
- Dynamic per-plan pipeline configuration files.
- Full overview-plan execution.
- Advanced UI dashboards.
- Automatic implementation by the parent thread.
