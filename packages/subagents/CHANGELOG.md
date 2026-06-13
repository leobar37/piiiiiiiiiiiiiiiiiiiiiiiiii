# Changelog

## [Unreleased]

### Added

- Added `none` Lion strategy for inactive orchestration state. When Lion is not active, strategy is now `"none"` instead of defaulting to `"plan"`, preventing the UI and prompts from incorrectly showing plan mode.
- Added `normalizeInactiveStrategy()` utility to migrate persisted states from older versions that defaulted to `strategy: "plan"` when inactive.
- Added `matchStrategy`, `matchStrategyOnly`, `matchPhase`, `isNoPlanStrategy`, and `hasActivePlan` pattern-matching utilities in `strategy-match.ts` to replace scattered if-chains across commands and task runner.
- Added bundled internal `planner` and `subagent-delegation` skills for subagent sessions, with internal skills taking precedence over same-name external skills.
- Added `/lion-code-review` to plan read-only code review delegations for dirty files and related functionality using the bundled `code-review` skill.
- Added durable `.reviews/` code review plans backed by the internal Lion checklist tools.
- Added internal Lion checklist tools and dashboard progress UI for durable `.plans/` and `.reviews/` checklists.
- Added Lion `review` strategy so `/lion-code-review` creates an active durable `.reviews/` plan with read-only checklist execution and false-positive validation.
- Added `threads.create` oRPC endpoint and `StandaloneSessionManager` to create real, persistent agent sessions directly from the dashboard, independent of Lion runs.
- Added optional `cwd` support to `threads.create` so dashboard-created sessions can start in a selected project directory.

### Changed

- Migrated the dashboard frontend from the custom hash-based router to TanStack Start with file-based routing and SPA mode. Removed `App.tsx`, `main.tsx`, `dev-main.tsx`, and `render-app.tsx` in favor of `router.tsx`, `client.tsx`, and `src/routes`.
- Changed `LionStrategyName` from `"plan" | "simple" | "review"` to `"plan" | "simple" | "review" | "none"` across backend types, frontend types, API schemas, and transport types.
- Changed `createInitialLionState()` to default `strategy` to `"none"` instead of `"plan"`.
- Changed `NoneLionStrategy.buildMainPrompt` to return an empty string so inactive Lion does not inject orchestration instructions into the system prompt.
- Changed `instructions/defaults.ts` to use a `NO_PLAN_STRATEGIES` Set (`["simple", "none"]`) instead of hardcoded `||` comparisons for source-truth instruction selection.
- Refactored `commands.ts` `/lion-build` handler to use `matchStrategyOnly` for strategy-dependent messages, guards, and side effects.
- Refactored `LionModeBadge.tsx` to use `Record<strategy, string>` lookup tables instead of nested ternaries.
- Refactored `task-runner.ts` `applyPhasePolicy` to use early returns and a private `#asReadOnlyTask` helper, eliminating duplicated read-only task configuration.

### Fixed

- Fixed dashboard-created sessions reporting under the selected project while running from the backend process working directory by exposing and validating each thread's effective cwd.
- Fixed main-thread dashboard prompts so slash commands such as `/lion-build` execute instead of being sent as plain user text.
- Fixed file-backed Lion state leaking active plan mode into newly opened sessions in the same working directory.
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
