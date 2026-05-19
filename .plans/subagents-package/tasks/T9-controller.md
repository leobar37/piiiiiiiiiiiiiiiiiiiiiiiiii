# T9: SubAgentController

## Goal
Orchestrator: definitions registry, instance factory, plan execution, RPC proxy methods.

## File: `src/controller.ts`

```typescript
export class SubAgentController {
  constructor(options: SubAgentControllerOptions)

  // Definitions
  registerDefinition(def: SubAgentDefinition): void
  unregisterDefinition(name: string): void
  getDefinition(name: string): SubAgentDefinition | undefined
  getDefinitions(): SubAgentDefinition[]

  // Lifecycle
  createInstance(task: DelegationTask): SubAgentInstance
  executeTask(task: DelegationTask): Promise<DelegationResult>
  executePlan(plan: ExecutionPlan): Promise<DelegationResult[]>

  // Instance access
  getInstance(taskId: string): SubAgentInstance | undefined
  getInstances(): SubAgentInstance[]

  // Instance control
  pauseInstance(taskId: string): Promise<void>
  resumeInstance(taskId: string): Promise<void>
  cancelInstance(taskId: string): Promise<void>
  queryInstance(taskId: string, request: QueryRequest): Promise<QueryResponse>
  summarizeInstance(taskId: string, options?: SummarizerOptions): ConversationSummary | null

  // RPC Proxy (delegate to instance)
  promptInstance(taskId: string, message: string, options?: PromptOptions): Promise<void>
  steerInstance(taskId: string, message: string, images?: ImageContent[]): Promise<void>
  abortInstance(taskId: string): Promise<void>
  getInstanceState(taskId: string): SubAgentRpcState
  setInstanceModel(taskId: string, model: Model<any>): Promise<void>
  cycleInstanceModel(taskId: string): Promise<ModelCycleResult | null>
  getInstanceMessages(taskId: string): AgentMessage[]
  instanceBash(taskId: string, command: string): Promise<BashResult>
  compactInstance(taskId: string, customInstructions?: string): Promise<CompactionResult>

  // Events
  getEventBus(): SubAgentEventBus

  // Cleanup
  dispose(): Promise<void>
  getArtifactsDir(): string
}
```

### createInstance()
1. Look up definition — throw if not found
2. Generate `instanceId`
3. Instantiate `SubAgentInstance`
4. Store in `this.instances`
5. Return instance

### executeTask()
```typescript
const instance = this.createInstance(task)
return instance.start()
```

### executePlan()
1. Validate all definitions exist
2. Create instances for all tasks
3. Build taskMap for dependency resolution
4. Dispatch to execution strategy
5. Return all results

### RPC Proxy Methods
All throw if instance not found. Example:
```typescript
async promptInstance(taskId, message, options) {
  const instance = this.getInstance(taskId)
  if (!instance) throw new Error(`Instance "${taskId}" not found`)
  return instance.prompt(message, options)
}
```

### dispose()
Dispose all instances, clear maps, clear event bus.

## Validation
- Unit test: executeTask with mock instance
- Unit test: executePlan sequential
- Unit test: RPC proxy methods throw for missing instance
