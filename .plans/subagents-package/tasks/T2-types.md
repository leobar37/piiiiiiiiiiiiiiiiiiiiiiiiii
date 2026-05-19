# T2: Type System

## Goal
All public interfaces: lifecycle, events, tasks, results, RPC state, queries.

## File: `src/types.ts`

### Interfaces to define

1. `SubAgentState` — union of 9 states (created, starting, running, paused, completing, completed, failed, cancelled, timed_out)
2. `SubAgentInstanceState` — snapshot with instanceId, taskId, state, timing, turnCount, currentTool, error
3. `SubAgentCapabilities` — { canEdit, canExecute, canWrite, canResearch }
4. `SubAgentDefinition` — name, description, systemPrompt, capabilities, tools, disabledTools, model, thinkingLevel, cwd, isolated, extensionFactory, maxTurns, timeout, allowQuery, verboseTools
5. `DelegationTask` — id, definition, prompt, inputArtifacts, outputArtifact, dependsOn, timeout
6. `ExecutionStrategy` — "sequential" | "parallel" | "dependency-graph"
7. `ExecutionPlan` — strategy + tasks
8. `DelegationStatus` — "completed" | "failed" | "blocked" | "timed_out" | "cancelled"
9. `DelegationResult` — taskId, agent, status, outputPath, summary, duration, error, turnCount, finalState
10. `SubAgentEventMap` — 10 event types: lifecycle.change, task.start, task.end, turn.complete, tool.execute, progress.update, query.response, summary.available, error
11. `SubAgentEventType` / `SubAgentEvent` — derived from event map
12. `SubAgentControllerOptions` — definitions, cwd, artifactsDir, onEvent, onLifecycleChange
13. `QueryRequest` / `QueryResponse` — queryId, question, timeoutMs, answer, duration, failed
14. `ConversationSummary` — messageCount, turnCount, toolCallCount, text, lastMessageAt
15. `SummarizerOptions` — maxMessages, maxTurns, includeTools
16. `SubAgentRpcState` — mirrors RpcSessionState: model, thinkingLevel, isStreaming, isCompacting, steeringMode, followUpMode, sessionFile, sessionId, sessionName, autoCompactionEnabled, messageCount, pendingMessageCount
17. `CreateSubAgentInstanceOptions` / `CreateSubAgentSessionOptions` / `CreateSubAgentSessionResult`

### Re-exports
- `ExtensionAPI`, `ExtensionFactory`, `ToolDefinition` from `@earendil-works/pi-coding-agent`
- `AgentMessage`, `ThinkingLevel` from `@earendil-works/pi-agent-core`
- `ImageContent`, `Model` from `@earendil-works/pi-ai`

## Validation
- All types compile with `tsc --noEmit`
- No `any` types
