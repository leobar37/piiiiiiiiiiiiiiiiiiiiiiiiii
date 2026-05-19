# T-001 Extension Shell and State

## Objective

Create the `lion` extension shell with clear module boundaries, typed state, and session persistence. This task establishes the foundation but does not implement plan loading or sub-agent execution.

## Requirements Covered

- `FR-001`
- `FR-015`
- `NFR-001`
- `NFR-002`

## Dependencies

- None

## Files or Areas Involved

- `packages/extensions/src/extensions/lion/index.ts` — Create — Extension entrypoint discoverable by build script.
- `packages/extensions/src/extensions/lion/types.ts` — Create — Core Lion domain types.
- `packages/extensions/src/extensions/lion/state.ts` — Create — Pure state transitions.
- `packages/extensions/src/extensions/lion/persistence.ts` — Create — Session entry restore/persist helpers.
- `packages/extensions/src/extensions/lion/commands.ts` — Create — Command registration shell.
- `packages/extensions/src/extensions/lion/ui.ts` — Create — Minimal status widget/rendering helpers if UI is available.
- `packages/extensions/src/extensions/lion/utils.ts` — Create — Small shared helpers.

## Expected Outcome

- `lion` appears as an extension entrypoint for `packages/extensions/build.ts`.
- State shape is versioned and includes active mode, active plan path/slug, active task, max attempts, and last build summary.
- Persistence reads the latest Lion state from session entries and writes new state snapshots.
- `index.ts` delegates responsibilities to `commands.ts`, `state.ts`, and `persistence.ts` instead of becoming a large orchestrator file.

## Context to Preserve

- Follow the stateful extension pattern demonstrated by `goal-v2`.
- Keep the parent thread as planning/orchestration only; this task defines state but not build behavior.
- Do not introduce extra user commands beyond `/lion-activate` and `/lion-build`.

## Constraints

- No external skill dependency.
- No sub-agent execution yet.
- No checklist modification yet.
- Avoid broad changes to package build scripts unless discovery shows they are required.

## Completion Criteria

- [ ] `packages/extensions/src/extensions/lion/index.ts` exists.
- [ ] `types.ts` defines `LionState`, `LionMode`, `LionPlanKind`, `LionPlan`, `LionTask`, `LionBuildResult`, and pipeline/event-related base types.
- [ ] `state.ts` exposes pure functions for initial state, activating a plan, changing mode, and applying build results.
- [ ] `persistence.ts` restores and persists versioned Lion state through extension session entries.
- [ ] `commands.ts` exposes a registration function for the two commands without full behavior yet.
- [ ] Extension package still builds or reaches only expected downstream missing-module errors from later tasks.

## Validation

```bash
npm run check
```

If this task is implemented before later tasks, package-level build may fail only if the shell imports modules that do not exist yet. Prefer creating placeholder exports instead of leaving broken imports.

## Expected Final Report

- Files created.
- State and persistence design summary.
- Any deviations from the proposed module layout.
- Validation command and result.
- Remaining risks or blockers for later tasks.

## Risks or Notes

- Overloading `index.ts` at this stage will make later orchestration hard to maintain.
- State versioning should be explicit from the beginning to allow future migration.
