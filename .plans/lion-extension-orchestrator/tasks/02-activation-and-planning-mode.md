# T-002 Activation and Planning Mode

## Objective

Implement `/lion-activate` behavior and system prompt injection for Lion planning/orchestration mode. Activation should support both no-argument planning mode and existing-plan activation once plan loading is available.

## Requirements Covered

- `FR-002`
- `FR-004`

## Dependencies

- `T-001`

## Files or Areas Involved

- `packages/extensions/src/extensions/lion/commands.ts` — Modify — Implement `/lion-activate` command flow.
- `packages/extensions/src/extensions/lion/index.ts` — Modify — Wire `before_agent_start` prompt injection.
- `packages/extensions/src/extensions/lion/state.ts` — Modify — Add activation/mode helpers if missing.
- `packages/extensions/src/extensions/lion/prompts/planning.ts` — Create or use from T-004 — Planning-mode prompt text.
- `packages/extensions/src/extensions/lion/ui.ts` — Modify — Show active mode and plan summary.

## Expected Outcome

- `/lion-activate` without arguments turns on planning mode.
- If a plan is already active, `/lion-activate` reports the current plan and keeps planning mode active.
- The parent system prompt clearly states that the parent thread may plan, inspect, and orchestrate, but may not implement application code directly.
- The prompt states plan files may be edited only with explicit user authorization.
- `/lion-activate <plan>` delegates plan resolution/loading to the plan module when available.

## Context to Preserve

- `/lion-activate` is not a build command.
- Activation should not run sub-agents.
- Activation should not mark tasks complete.
- Activation should not implement application code.

## Constraints

- Keep command handling thin; plan parsing belongs in `plans/` modules.
- Avoid adding separate commands for status/list/task in v1.
- If the user has not authorized plan-file writes, the parent can propose changes but not edit plan files.

## Completion Criteria

- [ ] `/lion-activate` is registered.
- [ ] No-argument activation sets state to active planning mode.
- [ ] Existing active state is restored and reflected in UI/status output.
- [ ] System prompt injection includes non-implementation and explicit-plan-write-authorization rules.
- [ ] Command response explains what Lion can do next without implementing anything.

## Validation

```bash
npm run check
```

Manual validation, if available later:

```text
/lion-activate
```

## Expected Final Report

- Activation behavior implemented.
- Prompt rules added.
- Any unresolved integration with plan loading.
- Validation result.

## Risks or Notes

- If activation prompt is too weak, the parent thread may drift into implementation. Keep the language explicit and repeated.
