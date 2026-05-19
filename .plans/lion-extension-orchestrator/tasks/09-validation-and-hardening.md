# T-009 Validation and Hardening

## Objective

Validate the integrated Lion extension, harden edge cases, and ensure repository checks pass before the feature is considered complete.

## Requirements Covered

- `NFR-001`
- `NFR-002`
- `NFR-006`
- `NFR-008`

## Dependencies

- `T-007`
- `T-008`

## Files or Areas Involved

- `packages/extensions/src/extensions/lion/**/*.ts` — Review and harden.
- `packages/subagents/src/**/*.ts` — Review only if touched by T-006.
- `packages/extensions` test locations, if existing patterns are found — Add focused tests where practical.
- `packages/subagents` test locations, if existing patterns are found and subagents API changed — Add focused tests where practical.
- `packages/extensions/README.md` or extension-local `README.md` — Optional concise usage docs.

## Expected Outcome

- Lion handles missing active plan, missing checklist, no pending tasks, blocked tasks, malformed reviewer verdict, sub-agent failure, and event store failure with clear messages.
- Any pure logic introduced for state, plan loading, verdict parsing, and rule monitoring has focused validation coverage where repo patterns allow it.
- `npm run check` passes.
- Final behavior aligns with the v1 scope: two commands, planning mode, one-task build, no parallelism, no worktrees.

## Context to Preserve

- Do not broaden the command surface during hardening.
- Do not add speculative features such as config files or overview execution unless explicitly required.
- Do not downgrade dependencies or remove intended functionality to silence type errors.

## Constraints

- Repository rule requires `npm run check` after code changes.
- If test files are created or modified, run those specific tests and iterate until they pass.
- Do not run forbidden commands such as `npm run build` or `npm test` unless user instructions change.

## Completion Criteria

- [ ] Edge cases return actionable errors.
- [ ] Verdict parsing cannot approve unknown output.
- [ ] Checklist updates preserve unrelated fields.
- [ ] Event logs are valid JSONL.
- [ ] Rule monitor reports violations without hiding failures.
- [ ] `npm run check` passes.
- [ ] Any created/modified tests pass when run specifically.

## Validation

```bash
npm run check
```

If focused tests are added, run the specific test file using the repository-approved command for that package.

## Expected Final Report

- Validation commands and results.
- Tests added or skipped with reason.
- Edge cases covered.
- Remaining risks.

## Risks or Notes

- End-to-end sub-agent execution may require real model/auth configuration; keep pure logic testable without real providers.
