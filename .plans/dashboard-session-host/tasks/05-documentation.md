# T-005 Document the Server APIs

## Objective

Add comprehensive documentation for the new session server capabilities: JSDoc on all public APIs, a README section showing how to start the server and interact with sessions, and a CHANGELOG entry documenting the addition.

## Requirements Covered

- `FR-011`
- `NFR-005`

## Dependencies

- `T-002`

## Files or Areas Involved

- `packages/dashboard/src/session-host.ts` — Modify | Add JSDoc — all public methods and classes
- `packages/dashboard/src/session-router.ts` — Modify | Add JSDoc — router factory and endpoint descriptions
- `packages/dashboard/src/daemon.ts` — Modify | Add JSDoc — SessionHost integration
- `packages/dashboard/README.md` — Modify | Expand — server usage section
- `packages/dashboard/CHANGELOG.md` — Modify — entry under `[Unreleased]`

## Expected Outcome

- Every public method on `SessionHost`, `LiveSession`, and the session router has JSDoc explaining parameters, return value, and possible errors.
- README has a section titled "Session API" or similar with:
  - How to start the daemon
  - How to create, start, and prompt a session via curl or oRPC client
  - How to connect to the SSE event stream
- CHANGELOG has an entry under `## [Unreleased]` in the `### Added` section.

## Context to Preserve

- Existing README content must remain. The new section should be additive.
- CHANGELOG format must follow the project standard (already documented in AGENTS.md).

## Constraints

- Do not document frontend/UI — this is a server-only plan.
- JSDoc must be accurate; do not document features that are not yet implemented.

## Completion Criteria

- `bun run build` passes (JSDoc does not break compilation).
- README renders correctly in markdown preview.
- CHANGELOG follows the established format.

## Validation

- `bun run build` in `packages/dashboard`
- Visual inspection of README and CHANGELOG

## Expected Final Report

- Which files received JSDoc additions
- README section summary
- CHANGELOG entry text

## Risks or Notes

- The README may not exist yet. If so, create it with a basic structure.
