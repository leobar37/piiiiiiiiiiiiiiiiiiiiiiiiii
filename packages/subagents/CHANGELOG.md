# Changelog

## [Unreleased]

### Added

- Added bundled internal `planner` and `subagent-delegation` skills for subagent sessions, with internal skills taking precedence over same-name external skills.
- Added `/lion-code-review` to plan read-only code review delegations for dirty files and related functionality using the bundled `code-review` skill.
- Added durable `.reviews/` code review plans backed by the internal Lion checklist tools.
- Added internal Lion checklist tools and dashboard progress UI for durable `.plans/` and `.reviews/` checklists.
- Added Lion `review` strategy so `/lion-code-review` creates an active durable `.reviews/` plan with read-only checklist execution and false-positive validation.

### Fixed

- Fixed Lion plan task completion so active plan tasks require structured subagent results with verified evidence before marking checklist tasks complete.
- Fixed blocked Lion subagent outcomes being flattened into failed status in job and dashboard state.
- Fixed Lion compaction handoffs missing explicit completion-gate and next-step context.
- Fixed `paramsStrategy` in `TaskRunner` accessing non-existent `result.plan.strategy` by passing `strategy` directly from the execution context.
- Fixed `SimpleLionStrategy.decorateTaskPrompt` idempotency check to use `</lion_context>` tag detection instead of fragile string matching.
- Fixed null `activeRun` in simple mode by adding `buildSyntheticRun()` to create synthetic run records for both success and error paths.
- Fixed `LionDelegationGuard` being a no-op stub. Now implements delegation depth limiting with `MAX_DELEGATION_DEPTH = 3` and proper depth tracking.
- Fixed `buildCompactionInstructions` in simple mode losing subagent context by adding `recentJobs` fallback to `LionCompactionContext`.
- Fixed `PlanLionStrategy.buildCompactionInstructions` missing `recentJobs` fallback when no active run exists.
- Fixed `escapeXml` missing apostrophe escape (`'` -> `&apos;`).
- Fixed false positives in evidence classification by adding `NEGATION_PATTERN` to detect phrases like "no errors", "0 failures", "error-free".
- Fixed incomplete UI cleanup in `handleExecutionError` by adding `subagentUi.delete`, `cleanupSubagentUi`, and widget re-render.
- Fixed `getRecentJobs` returning jobs from all strategies by filtering to current `activeRunId` in plan mode.
- Fixed `buildSyntheticRun` hardcoding "executor" role by adding `inferRoleFromDefinition()` to map definition names to roles.
