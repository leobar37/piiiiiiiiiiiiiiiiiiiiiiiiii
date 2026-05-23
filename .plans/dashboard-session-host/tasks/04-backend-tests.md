# T-004 Write Backend Tests for SessionHost

## Objective

Write comprehensive backend tests for `SessionHost`, `LiveSession`, and the session router covering creation, lifecycle, prompting, event streaming, resource limits, idle cleanup, and error paths.

## Requirements Covered

- `NFR-002`

## Dependencies

- `T-002`

## Files or Areas Involved

- `packages/dashboard/test/session-host.test.ts` — Create — tests for SessionHost and LiveSession
- `packages/dashboard/test/session-router.test.ts` — Create — tests for oRPC router endpoints
- `packages/dashboard/vitest.config.ts` — Review | Modify — ensure test environment is configured

## Expected Outcome

- `SessionHost.create()`, `open()`, `continueRecent()` work and return valid sessions.
- `LiveSession.start()` transitions through `starting` to `idle`; `stop()` transitions to `stopped`.
- `prompt()`, `steer()`, `followUp()`, `abort()` work on a running session and fail clearly on a stopped one.
- Per-session event streaming yields `AgentSessionEvent` objects.
- `maxActiveSessions` is enforced: the N+1th start is rejected.
- `cleanupIdleSessions()` evicts sessions past the timeout.
- `getMessages()` and `getState()` return correct data with and without an active runtime.
- Error during `start()` transitions the session to `error` and propagates the error.

## Context to Preserve

- Tests must not use real LLM API keys. Mock or faux provider patterns from `coding-agent/test/suite/` should be reused.
- Clean up created session files in `afterEach` to avoid disk pollution.

## Constraints

- Tests should be fast and not leak resources.
- Use `vi.useFakeTimers()` for idle timeout tests.
- All tests must run with `bun x vitest --run`.

## Completion Criteria

- All tests pass.
- Coverage includes all public methods of `SessionHost` and `LiveSession`.
- Router tests verify at least one successful request/response cycle per endpoint category (CRUD, interaction, streaming).

## Validation

- `bun x vitest --run packages/dashboard/test/session-host.test.ts`
- `bun x vitest --run packages/dashboard/test/session-router.test.ts`

## Expected Final Report

- Test coverage summary (which methods are covered)
- Mocking strategy for AgentSession / LLM provider
- Test run results

## Risks or Notes

- `createAgentSession()` requires auth/model setup. Determine if a minimal mock provider or the `coding-agent` test harness can be reused.
- Event streaming tests need async iterators and AbortSignal handling.
