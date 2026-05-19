# T-004 Internal Prompts

## Objective

Create all Lion runtime prompts inside the extension so Lion does not depend on external skills for planning, execution delegation, review, or correction behavior.

## Requirements Covered

- `FR-004`
- `FR-008`
- `FR-014`
- `NFR-007`

## Dependencies

- `T-001`

## Files or Areas Involved

- `packages/extensions/src/extensions/lion/prompts/index.ts` — Create — Public prompt exports.
- `packages/extensions/src/extensions/lion/prompts/planning.ts` — Create — Parent-thread planning/orchestration prompt.
- `packages/extensions/src/extensions/lion/prompts/executor.ts` — Create — Executor delegation prompt builder.
- `packages/extensions/src/extensions/lion/prompts/reviewer.ts` — Create — Reviewer prompt builder and verdict contract.
- `packages/extensions/src/extensions/lion/prompts/correction.ts` — Create — Correction delegation prompt builder.
- `packages/extensions/src/extensions/lion/types.ts` — Modify — Add prompt input types if helpful.

## Expected Outcome

- Planning prompt tells the parent thread it may plan and inspect, but not implement application code directly.
- Planning prompt tells the parent thread it may edit plan files only after explicit user authorization.
- Executor prompt includes plan context, requirements, task brief, constraints, validation expectations, and final report fields.
- Reviewer prompt checks implementation against task brief, requirements, completion criteria, and repository rules.
- Reviewer prompt requires exactly one parseable verdict line: `LION_REVIEW_STATUS: approved` or `LION_REVIEW_STATUS: rejected`.
- Correction prompt includes reviewer feedback and instructs minimal targeted fixes.

## Context to Preserve

- Prompts should be deterministic source code, not generated from external skills.
- Prompts should support future tests by being pure functions.
- Prompts should avoid encouraging the parent thread to perform implementation.

## Constraints

- No inline imports.
- No hidden dependency on `.claude/skills` or framework commands.
- Keep prompts concise enough for repeated pipeline use but complete enough to enforce process.

## Completion Criteria

- [ ] All prompt modules exist and export typed builder functions.
- [ ] Planning prompt contains the no-direct-implementation rule.
- [ ] Planning prompt contains the explicit-plan-write-authorization rule.
- [ ] Reviewer prompt contains mandatory `LION_REVIEW_STATUS` output contract.
- [ ] Executor and correction prompts include expected final report fields.

## Validation

```bash
npm run check
```

Optional focused validation:

- Inspect prompt output snapshots manually or through small unit tests if the package has a test pattern.

## Expected Final Report

- Prompt builders created.
- Output contract summary.
- Validation result.

## Risks or Notes

- If reviewer verdict text is not exact, strategy parsing becomes unreliable. Keep the contract strict.
