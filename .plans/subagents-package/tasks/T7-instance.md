# T7: SubAgentInstance + RPC Adapter

## Goal
Core unit: lifecycle state machine, query(), summarize(), + full RPC Adapter API.

## File: `src/instance.ts`

### Constructor
```typescript
export interface CreateSubAgentInstanceOptions {
  instanceId: string
  definition: SubAgentDefinition
  task: DelegationTask
  cwd: string
  artifactsDir: string
  eventBus: SubAgentEventBus
  authStorage?: AuthStorage
  modelRegistry?: ModelRegistry
  settingsManager?: SettingsManager
}

export class SubAgentInstance {
  readonly instanceId: string
  readonly taskId: string
  readonly definitionName: string
  constructor(options: CreateSubAgentInstanceOptions)
}
```

### Lifecycle API
```typescript
getState(): SubAgentInstanceState
start(): Promise<DelegationResult>
query(request: QueryRequest): Promise<QueryResponse>
summarize(options?: SummarizerOptions): ConversationSummary | null
pause(): Promise<void>
resume(): Promise<void>
cancel(): Promise<void>
dispose(): Promise<void>
```

### RPC Adapter API (direct AgentSession delegation)
```typescript
prompt(message: string, options?: { images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }): Promise<void>
steer(message: string, images?: ImageContent[]): Promise<void>
followUp(message: string, images?: ImageContent[]): Promise<void>
abort(): Promise<void>
getRpcState(): SubAgentRpcState
setModel(model: Model<any>): Promise<void>
cycleModel(): Promise<{ model: Model<any>; thinkingLevel: ThinkingLevel; isScoped: boolean } | null>
getAvailableModels(): Promise<Model<any>[]>
setThinkingLevel(level: ThinkingLevel): void
cycleThinkingLevel(): ThinkingLevel | null
setSteeringMode(mode: "all" | "one-at-a-time"): void
setFollowUpMode(mode: "all" | "one-at-a-time"): void
compact(customInstructions?: string): Promise<CompactionResult>
setAutoCompaction(enabled: boolean): void
setAutoRetry(enabled: boolean): void
abortRetry(): void
bash(command: string): Promise<BashResult>
abortBash(): void
getSessionStats(): SessionStats
exportHtml(outputPath?: string): Promise<string>
getMessages(): AgentMessage[]
getLastAssistantText(): string | null
setSessionName(name: string): void
getSessionName(): string | undefined
getCwd(): string
getPendingMessageCount(): number
clearQueue(): { steering: string[]; followUp: string[] }
getActiveToolNames(): string[]
getAllTools(): ToolInfo[]
setActiveTools(toolNames: string[]): void
```

### State Machine
```
created → starting → running → completing → completed
                  ↓           ↓            ↓
                paused     failed        cancelled
                           timed_out
```

### start() Behavior
1. Transition `created` → `starting`
2. Call `createSubAgentSession()` (T6)
3. Subscribe to `AgentSessionEvent`s:
   - `agent_start`: transition to `running`, emit `task.start`
   - `turn_end`: increment turnCount, emit `turn.complete`
   - `tool_execution_start`: set currentTool, emit `tool.execute`
   - `tool_execution_end`: clear currentTool
   - `message_end` (assistant): emit `progress.update`
   - `agent_end`: transition to `completing`
4. In `completing`: read output artifact, write result, write event log
5. Transition to `completed`, emit `task.end`, resolve completion promise

### query() Behavior
Only when `state === "running"`.
1. Create queryId
2. Register resolver
3. `session.steer(formattedQuestion)`
4. Listen for next assistant `message_end`
5. Extract response, resolve, emit `query.response`

### RPC Adapter Methods
All delegate to `this.session.*`. Throw if session is null: `"SubAgentInstance not running. State: ${state}"`.

### pause() / resume() / cancel()
- `pause()`: `session.abort()`, state → `paused`
- `resume()`: `session.sendUserMessage("Continue.")`, state → `running`
- `cancel()`: `session.abort()`, state → `cancelled`, resolve completion with cancelled status

### dispose()
Idempotent. `session.dispose()`, cleanup, clear resolvers, remove listeners.

## Validation
- State transitions emit `lifecycle.change`
- Query works only in `running` state
- RPC methods throw in `created` state
- dispose() is idempotent
