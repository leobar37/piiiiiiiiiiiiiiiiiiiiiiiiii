# T12: Public API + Workspace Registration

## Goal
Public exports and workspace integration.

## File: `src/index.ts`

```typescript
// Types
export type {
  SubAgentDefinition, SubAgentCapabilities,
  DelegationTask, ExecutionPlan, ExecutionStrategy,
  DelegationResult, DelegationStatus,
  SubAgentState, SubAgentInstanceState,
  SubAgentEvent, SubAgentEventType, SubAgentEventMap,
  SubAgentControllerOptions,
  QueryRequest, QueryResponse,
  ConversationSummary, SummarizerOptions,
  SubAgentRpcState,
  CreateSubAgentInstanceOptions, CreateSubAgentSessionOptions, CreateSubAgentSessionResult
} from "./types.js"

// Controller
export { SubAgentController } from "./controller.js"

// Instance
export { SubAgentInstance } from "./instance.js"

// Event bus
export { SubAgentEventBus } from "./event-bus.js"

// Summarizer
export { SubAgentSummarizer } from "./summarizer.js"

// Session factory
export { createSubAgentSession } from "./session-factory.js"

// Artifacts
export {
  readArtifact, readResultArtifact, artifactExists, listResultArtifacts,
  writeDelegationArtifact, writeResultArtifact, writeEventLog, ensureDelegationsDir
} from "./artifacts/index.js"

// Execution strategies
export {
  executeSequential, executeParallel, executeDependencyGraph, execute
} from "./execution/index.js"

// Built-in definitions
export {
  plannerDefinition, executorDefinition, analyzerDefinition, reviewerDefinition, BUILTIN_DEFINITIONS
} from "./definitions/index.js"

// Extension
export { default as subagentsExtension } from "./extensions/subagents/index.js"
```

## Root `package.json` Workspaces

Add `@local/pi-subagents` to root workspaces if not already covered by `packages/*` glob.

## Validation
- `bun run build` from package root succeeds
- All exports are accessible
- No circular dependencies
