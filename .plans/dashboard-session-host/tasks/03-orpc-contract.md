# T-003 Export Typed oRPC Contract for Clients

## Objective

Create a typed oRPC contract that describes all session and dashboard endpoints so any client (frontend, CLI, external tools) can use `@orpc/client` with full type safety. The contract must cover the existing dashboard endpoints plus all new session endpoints.

## Requirements Covered

- `FR-007`
- `NFR-001`

## Dependencies

- `T-002`

## Files or Areas Involved

- `packages/dashboard/src/contract.ts` — Modify | Expand — add session contract definitions
- `packages/dashboard/src/index.ts` — Modify | Exports — expose contract and related types
- `packages/dashboard/package.json` — Review | Modify — ensure `@orpc/client` or `@orpc/contract` is available

## Expected Outcome

- A typed oRPC contract object exported from the dashboard package.
- Clients can import it and create a typed client:
  ```ts
  import { contract } from "@earendil-works/pi-web";
  const client = createORPCClient({ contract, url: "/api" });
  const { session } = await client.sessions.create.call({ cwd: "/project" });
  ```
- All session types (`LiveSessionInfo`, `SessionStatus`, `SessionState`, `AgentSessionEvent`) are exported.
- Existing contract exports (`DashboardEventPayload`, `DashboardState`, etc.) remain untouched.

## Context to Preserve

- The contract must be backward-compatible. Do not rename or remove existing exported types.

## Constraints

- Use oRPC contract primitives compatible with `@orpc/server` 1.14.3.
- Do not duplicate Zod schemas — reference or reuse the ones from `session-router.ts` and `router.ts`.

## Completion Criteria

- The contract is importable from the dashboard package root.
- TypeScript intellisense works for all endpoints.
- `bun run build` passes.

## Validation

- `bun run build` in `packages/dashboard`
- A minimal type-check file that imports the contract and instantiates a client

## Expected Final Report

- Contract structure overview
- How clients consume it
- Type-check validation results

## Risks or Notes

- Verify the exact oRPC contract API for version 1.14.3.
- If a separate `@orpc/contract` package is needed, it must be added as a dependency.
