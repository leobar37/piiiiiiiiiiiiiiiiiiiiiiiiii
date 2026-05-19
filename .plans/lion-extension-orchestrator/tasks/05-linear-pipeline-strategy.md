# T-005 Linear Pipeline Strategy

## Objective

Implement the pure strategy layer for one-task-at-a-time execution: executor delegation, reviewer delegation, parse verdict, correction loop, and final build result.

## Requirements Covered

- `FR-008`
- `FR-009`

## Dependencies

- `T-003`
- `T-004`

## Files or Areas Involved

- `packages/extensions/src/extensions/lion/strategies/index.ts` — Create — Public strategy exports.
- `packages/extensions/src/extensions/lion/strategies/linear-pipeline.ts` — Create — Main linear strategy.
- `packages/extensions/src/extensions/lion/strategies/review-verdict.ts` — Create — Verdict parser.
- `packages/extensions/src/extensions/lion/types.ts` — Modify — Build/pipeline result types.

## Expected Outcome

- Strategy accepts plan, task, prompt builders, and sub-agent runner callbacks.
- Strategy performs up to `maxAttempts` attempts.
- Each attempt runs executor then reviewer.
- `approved` verdict returns an approved build result.
- `rejected` verdict feeds reviewer feedback into a correction prompt for the next attempt.
- Unknown/missing verdict is treated as rejected or failed, never as approved.

## Context to Preserve

- Strategy should be mostly pure and independent from Pi command APIs.
- Sub-agent execution should be injected as callbacks or via a thin adapter, not embedded deeply in strategy code.
- Checklist updates happen after strategy success, not inside verdict parser.

## Constraints

- V1 remains linear.
- No parallel execution.
- No worktrees.
- No automatic whole-plan execution unless explicitly required later.

## Completion Criteria

- [ ] `parseReviewVerdict` accepts exact approved/rejected lines.
- [ ] Missing verdict cannot produce approval.
- [ ] Strategy returns attempts count and summaries.
- [ ] Strategy preserves reviewer feedback for correction attempts.
- [ ] Strategy has clear failure result when `maxAttempts` is reached.

## Validation

```bash
npm run check
```

Recommended focused tests if test infrastructure is available:

- Approved on first attempt.
- Rejected then approved on second attempt.
- Missing verdict fails safely.
- Max attempts reached.

## Expected Final Report

- Strategy behavior summary.
- Verdict parser behavior.
- Tests or validation run.
- Remaining edge cases.

## Risks or Notes

- Keep this layer free of filesystem and command concerns so it can be tested without spawning sub-agents.
