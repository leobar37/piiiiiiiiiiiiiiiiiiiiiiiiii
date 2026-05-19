# Requirements: packages/subagents (v2 — Controller + RPC Adapter)

## Scope

Create `packages/subagents` (`@local/pi-subagents`) as a **sub-agent controller framework** with three layers:

1. **SubAgentController** — orchestrates multiple `SubAgentInstance`s
2. **SubAgentInstance** — wraps one `AgentSession` with full lifecycle control + RPC-style API
3. **Bidirectional event bus** — rich events from sub-agents; interrogation and summarization

The key addition: **each SubAgentInstance exposes the full RPC-mode API** (`prompt`, `steer`, `get_state`, `set_model`, `compact`, `bash`, `get_messages`, etc.) as direct programmatic methods. The orchestrator controls every sub-agent with the same granularity as a headless RPC session, but fully isolated and in-memory.

---

## R1: Package Scaffold

### R1.1 — `package.json`

```json
{
  "name": "@local/pi-subagents",
  "version": "0.0.1",
  "description": "Sub-agent controller with lifecycle, events, and RPC adapter",
  "type": "module",
  "private": true,
  "keywords": ["pi-package"],
  "scripts": {
    "build": "bun run build.ts",
    "watch": "bun run build.ts --watch"
  },
  "pi": {
    "extensions": ["./dist"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-agent-core": "*",
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-tui": "*"
  }
}
```

### R1.2 — `build.ts`

Replicate from `packages/extensions/build.ts`:
- Discovers `src/extensions/<name>/index.ts`
- Bundles each to `dist/<name>.js` using Bun.build
- ESM output, `target: "bun"`
- Supports `--watch`

### R1.3 — `tsconfig.build.json`

Extends `../../tsconfig.base.json`, `rootDir: "./src"`, `outDir: "./dist"`, includes `src/**/*.ts`, `declaration: true`.

### R1.4 — `.gitignore`

`dist/`, `node_modules/`.

---

## R2: Type System (`src/types.ts`)

### R2.1 — Sub-agent Lifecycle

```typescript
export type SubAgentState =
  | "created"
  | "starting"
  | "running"
  | "paused"
  | "completing"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"

export interface SubAgentInstanceState {
  instanceId: string
  taskId: string
  definitionName: string
  state: SubAgentState
  startTime: number | null
  endTime: number | null
  turnCount: number
  lastActivityAt: number
  currentTool: string | null
  error: string | null
}
```

### R2.2 — SubAgentDefinition

```typescript
export interface SubAgentCapabilities {
  canEdit: boolean
  canExecute: boolean
  canWrite: boolean
  canResearch: boolean
}

export interface SubAgentDefinition {
  name: string
  description: string
  systemPrompt: string
  capabilities: SubAgentCapabilities
  tools?: string[]
  disabledTools?: string[]
  model?: string
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high"
  cwd?: string
  isolated?: boolean
  extensionFactory?: ExtensionFactory
  maxTurns?: number
  timeout?: number
  allowQuery?: boolean
  verboseTools?: boolean
}
```

### R2.3 — DelegationTask

```typescript
export interface DelegationTask {
  id: string
  definition: string
  prompt: string
  inputArtifacts?: string[]
  outputArtifact: string
  dependsOn?: string[]
  timeout?: number
}
```

### R2.4 — ExecutionPlan

```typescript
export type ExecutionStrategy = "sequential" | "parallel" | "dependency-graph"

export interface ExecutionPlan {
  strategy: ExecutionStrategy
  tasks: DelegationTask[]
}
```

### R2.5 — DelegationResult

```typescript
export type DelegationStatus = "completed" | "failed" | "blocked" | "timed_out" | "cancelled"

export interface DelegationResult {
  taskId: string
  agent: string
  status: DelegationStatus
  outputPath: string
  summary: string
  duration: number
  error?: string
  turnCount: number
  finalState: SubAgentInstanceState
}
```

### R2.6 — SubAgentEvent (rich event model)

```typescript
export interface SubAgentEventMap {
  "lifecycle.change": {
    type: "lifecycle.change"
    instanceId: string
    previous: SubAgentState
    current: SubAgentState
    timestamp: number
  }

  "task.start": {
    type: "task.start"
    instanceId: string
    taskId: string
    definitionName: string
    timestamp: number
  }

  "task.end": {
    type: "task.end"
    instanceId: string
    taskId: string
    result: DelegationResult
    timestamp: number
  }

  "turn.complete": {
    type: "turn.complete"
    instanceId: string
    taskId: string
    turnIndex: number
    toolCount: number
    hadError: boolean
    timestamp: number
  }

  "tool.execute": {
    type: "tool.execute"
    instanceId: string
    taskId: string
    toolName: string
    toolCallId: string
    isError: boolean
    timestamp: number
  }

  "progress.update": {
    type: "progress.update"
    instanceId: string
    taskId: string
    message: string
    timestamp: number
  }

  "query.response": {
    type: "query.response"
    instanceId: string
    taskId: string
    queryId: string
    question: string
    answer: string
    timestamp: number
  }

  "summary.available": {
    type: "summary.available"
    instanceId: string
    taskId: string
    summary: string
    messageCount: number
    timestamp: number
  }

  "error": {
    type: "error"
    instanceId: string
    taskId: string
    error: string
    fatal: boolean
    timestamp: number
  }
}

export type SubAgentEventType = keyof SubAgentEventMap
export type SubAgentEvent = SubAgentEventMap[SubAgentEventType]
```

### R2.7 — SubAgentControllerOptions

```typescript
export interface SubAgentControllerOptions {
  definitions: SubAgentDefinition[]
  cwd: string
  artifactsDir?: string
  onEvent?: (event: SubAgentEvent) => void
  onLifecycleChange?: (event: SubAgentEventMap["lifecycle.change"]) => void
}
```

### R2.8 — QueryRequest / QueryResponse

```typescript
export interface QueryRequest {
  queryId: string
  question: string
  timeoutMs?: number
}

export interface QueryResponse {
  queryId: string
  question: string
  answer: string
  duration: number
  failed: boolean
}
```

### R2.9 — ConversationSummary

```typescript
export interface ConversationSummary {
  messageCount: number
  turnCount: number
  toolCallCount: number
  text: string
  lastMessageAt: number
}
```

### R2.10 — RpcSessionState (mirrors rpc-types.ts)

```typescript
export interface SubAgentRpcState {
  model?: Model<any>
  thinkingLevel: ThinkingLevel
  isStreaming: boolean
  isCompacting: boolean
  steeringMode: "all" | "one-at-a-time"
  followUpMode: "all" | "one-at-a-time"
  sessionFile?: string
  sessionId: string
  sessionName?: string
  autoCompactionEnabled: boolean
  messageCount: number
  pendingMessageCount: number
}
```

### R2.11 — Re-exports

Re-export from peer deps:
- `ExtensionAPI`, `ExtensionFactory`, `ToolDefinition` from `@earendil-works/pi-coding-agent`
- `AgentMessage`, `ThinkingLevel` from `@earendil-works/pi-agent-core`
- `ImageContent`, `Model` from `@earendil-works/pi-ai`

---

## R3: Event Bus (`src/event-bus.ts`)

```typescript
export class SubAgentEventBus {
  private listeners: Map<SubAgentEventType | "*", Set<(event: SubAgentEvent) => void>>

  on<T extends SubAgentEventType>(type: T | "*", listener: (event: SubAgentEventMap[T]) => void): () => void
  emit<T extends SubAgentEventType>(event: SubAgentEventMap[T]): void
  off(type: SubAgentEventType | "*", listener: (event: SubAgentEvent) => void): void
  clear(): void
}
```

---

## R4: Artifact I/O (`src/artifacts/`)

### R4.1 — `reader.ts`

```typescript
export function readArtifact(artifactsDir: string, path: string): string
export function readResultArtifact(artifactsDir: string, taskId: string): string | null
export function artifactExists(artifactsDir: string, path: string): boolean
export function listResultArtifacts(artifactsDir: string): string[]
```

### R4.2 — `writer.ts`

```typescript
export function writeDelegationArtifact(
  artifactsDir: string,
  task: DelegationTask,
  definition: SubAgentDefinition,
  contextFiles: Map<string, string>
): string

export function writeResultArtifact(
  artifactsDir: string,
  taskId: string,
  result: { status: string; summary: string; outputPath: string; turnCount: number; duration: number }
): void

export function writeEventLog(artifactsDir: string, taskId: string, events: SubAgentEvent[]): void
export function ensureDelegationsDir(artifactsDir: string): void
```

### R4.3 — Artifact Formats

**Input** (`.delegations/<taskId>.md`) — standard delegation prompt.

**Output** (`.delegations/<taskId>.result.md`):
```markdown
# Result: <taskId>
- **Status**: <status>
- **Agent**: <definition.name>
- **Duration**: <Xms>
- **Turns**: <N>
- **State transitions**: created → starting → running → completing → completed
## Summary
<summary>
## Output
See: <outputPath>
## Event Log
See: `.delegations/<taskId>.events.jsonl`
```

**Event log** (`.delegations/<taskId>.events.jsonl`) — newline-delimited JSON.

---

## R5: Summarizer (`src/summarizer.ts`)

```typescript
export interface SummarizerOptions {
  maxMessages?: number
  maxTurns?: number
  includeTools?: boolean
}

export class SubAgentSummarizer {
  summarize(sessionManager: SessionManager, options?: SummarizerOptions): ConversationSummary
}
```

Reads `sessionManager.getBranch()`, filters message entries, formats as markdown. No LLM call — purely formative.

---

## R6: SubAgentInstance (`src/instance.ts`)

The core unit. Wraps one `AgentSession` and exposes **both** the lifecycle API and the **full RPC adapter API**.

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

  // -- Lifecycle API --
  getState(): SubAgentInstanceState
  start(): Promise<DelegationResult>
  query(request: QueryRequest): Promise<QueryResponse>
  summarize(options?: SummarizerOptions): ConversationSummary | null
  pause(): Promise<void>
  resume(): Promise<void>
  cancel(): Promise<void>
  dispose(): Promise<void>

  // -- RPC Adapter API (direct session control) --
  // These methods proxy directly to the underlying AgentSession.
  // They throw if the session is not yet created or already disposed.

  /** Send a prompt to the agent. Triggers a turn. */
  prompt(message: string, options?: { images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }): Promise<void>

  /** Send a steering message while the agent is streaming. */
  steer(message: string, images?: ImageContent[]): Promise<void>

  /** Queue a follow-up message. */
  followUp(message: string, images?: ImageContent[]): Promise<void>

  /** Abort the current agent operation. */
  abort(): Promise<void>

  /** Get the current session state. */
  getRpcState(): SubAgentRpcState

  /** Set the model for this sub-agent. */
  setModel(model: Model<any>): Promise<void>

  /** Cycle to the next available model. */
  cycleModel(): Promise<{ model: Model<any>; thinkingLevel: ThinkingLevel; isScoped: boolean } | null>

  /** Get all available models. */
  getAvailableModels(): Promise<Model<any>[]>

  /** Set thinking level. */
  setThinkingLevel(level: ThinkingLevel): void

  /** Cycle thinking level. */
  cycleThinkingLevel(): ThinkingLevel | null

  /** Set steering mode. */
  setSteeringMode(mode: "all" | "one-at-a-time"): void

  /** Set follow-up mode. */
  setFollowUpMode(mode: "all" | "one-at-a-time"): void

  /** Manually compact the session context. */
  compact(customInstructions?: string): Promise<CompactionResult>

  /** Enable/disable auto-compaction. */
  setAutoCompaction(enabled: boolean): void

  /** Enable/disable auto-retry. */
  setAutoRetry(enabled: boolean): void

  /** Abort any pending retry. */
  abortRetry(): void

  /** Execute a bash command in the sub-agent's cwd. */
  bash(command: string): Promise<BashResult>

  /** Abort the current bash execution. */
  abortBash(): void

  /** Get session statistics. */
  getSessionStats(): SessionStats

  /** Export session to HTML. */
  exportHtml(outputPath?: string): Promise<string>

  /** Get all messages in the session. */
  getMessages(): AgentMessage[]

  /** Get the last assistant message text. */
  getLastAssistantText(): string | null

  /** Set the session display name. */
  setSessionName(name: string): void

  /** Get the current session name. */
  getSessionName(): string | undefined

  /** Get the current working directory. */
  getCwd(): string

  /** Get the number of pending messages (steering + follow-up). */
  getPendingMessageCount(): number

  /** Clear all queued messages and return them. */
  clearQueue(): { steering: string[]; followUp: string[] }

  /** Get active tool names. */
  getActiveToolNames(): string[]

  /** Get all configured tools. */
  getAllTools(): ToolInfo[]

  /** Set active tools by name. */
  setActiveTools(toolNames: string[]): void
}
```

### R6.1 — Lifecycle State Machine

```
created ──start()──→ starting ──session ready──→ running
                                          │
                                          ├─query()→ (still running, emits query.response)
                                          │
                                          ├─pause()──→ paused ──resume()──→ running
                                          │
                                          ├─cancel()──→ cancelled
                                          │
                                          └──agent_end──→ completing ──artifacts──→ completed
                                                            │
                                                            └─error──→ failed
                                                            └─timeout──→ timed_out
```

State transitions emit `lifecycle.change` events.

### R6.2 — `start()` Behavior

1. Transition `created` → `starting`
2. Call `createSubAgentSession()` (R8)
3. Subscribe to `AgentSessionEvent`s:
   - `agent_start`: emit `task.start`, transition `starting` → `running`
   - `turn_end`: increment turnCount, emit `turn.complete`
   - `tool_execution_start`: set currentTool, emit `tool.execute`
   - `tool_execution_end`: clear currentTool
   - `message_end` (assistant): emit `progress.update`
   - `agent_end`: transition to `completing`
4. In `completing`: read output artifact, write result, write event log
5. Transition to `completed`, emit `task.end`, resolve completion promise

### R6.3 — `query()` Behavior

Only allowed when state is `running`.

1. Validate state
2. Create `queryId`
3. Register resolver
4. Send via `session.steer(formattedQuestion)`
5. Listen for next assistant `message_end`
6. Extract response, resolve promise, emit `query.response`

### R6.4 — `summarize()` Behavior

1. If no session, return `null`
2. Read `sessionManager.getBranch()`
3. Format as markdown
4. Emit `summary.available`

### R6.5 — RPC Adapter Methods

All RPC adapter methods delegate directly to the underlying `AgentSession`. They must check that `this.session` exists and throw a clear error if not (e.g., `"SubAgentInstance is not running. Current state: created"`).

Examples:
- `prompt()` → `session.prompt()`
- `steer()` → `session.steer()`
- `getRpcState()` → reads `session.model`, `session.thinkingLevel`, `session.isStreaming`, etc.
- `bash()` → `session.executeBash()`
- `getMessages()` → `session.messages`

This gives the orchestrator **full control** over each sub-agent without going through the RPC JSONL protocol.

### R6.6 — `pause()` / `resume()` / `cancel()`

- `pause()`: `session.abort()`, transition to `paused`
- `resume()`: `session.sendUserMessage("Continue.")`, transition to `running`
- `cancel()`: `session.abort()`, transition to `cancelled`, resolve completion with cancelled status

### R6.7 — `dispose()`

Idempotent. Calls `session.dispose()`, cleanup (worktree), clears query resolvers, removes listeners.

---

## R7: Session Factory (`src/session-factory.ts`)

### R7.1 — `createSubAgentSession()`

```typescript
export interface CreateSubAgentSessionOptions {
  definition: SubAgentDefinition
  task: DelegationTask
  cwd: string
  artifactsDir: string
  eventBus: SubAgentEventBus
  instanceId: string
  authStorage?: AuthStorage
  modelRegistry?: ModelRegistry
  settingsManager?: SettingsManager
}

export interface CreateSubAgentSessionResult {
  session: AgentSession
  cleanup: () => Promise<void>
}

export async function createSubAgentSession(
  options: CreateSubAgentSessionOptions
): Promise<CreateSubAgentSessionResult>
```

### R7.2 — Behavior

1. **Resolve cwd**: `definition.cwd` or isolated git worktree
2. **Create `DefaultResourceLoader`** with inline extension factory
3. **Inline extension factory** (`subAgentPersonalityFactory`):

```typescript
function subAgentPersonalityFactory(
  definition: SubAgentDefinition,
  task: DelegationTask,
  instanceId: string,
  eventBus: SubAgentEventBus
): ExtensionFactory {
  return (pi: ExtensionAPI) => {
    // Tool restrictions
    pi.on("session_start", async () => {
      if (definition.tools?.length) {
        pi.setActiveTools(definition.tools)
      } else if (definition.disabledTools?.length) {
        const all = pi.getAllTools().map(t => t.name)
        pi.setActiveTools(all.filter(t => !definition.disabledTools!.includes(t)))
      }
    })

    // System prompt injection
    pi.on("before_agent_start", async (event) => {
      return { systemPrompt: `${event.systemPrompt}\n\n${definition.systemPrompt}` }
    })

    // Delegation instructions as first user message
    pi.on("session_start", async () => {
      const instructions = buildDelegationInstructions(task, definition)
      pi.sendUserMessage(instructions, { deliverAs: "steer" })
    })

    // Register custom extension factory from definition
    if (definition.extensionFactory) {
      definition.extensionFactory(pi)
    }
  }
}
```

4. **Reload and create session**
5. **Return** session + cleanup

---

## R8: Execution Strategies (`src/execution/`)

```typescript
export async function executeSequential(
  instances: SubAgentInstance[],
  onEvent?: (event: SubAgentEvent) => void
): Promise<DelegationResult[]>

export async function executeParallel(
  instances: SubAgentInstance[],
  onEvent?: (event: SubAgentEvent) => void
): Promise<DelegationResult[]>

export async function executeDependencyGraph(
  instances: SubAgentInstance[],
  taskMap: Map<string, DelegationTask>,
  onEvent?: (event: SubAgentEvent) => void
): Promise<DelegationResult[]>
```

---

## R9: SubAgentController (`src/controller.ts`)

```typescript
export class SubAgentController {
  private definitions: Map<string, SubAgentDefinition>
  private instances: Map<string, SubAgentInstance>
  private cwd: string
  private artifactsDir: string
  private eventBus: SubAgentEventBus
  private authStorage?: AuthStorage
  private modelRegistry?: ModelRegistry
  private settingsManager?: SettingsManager

  constructor(options: SubAgentControllerOptions)

  // --- Definitions ---
  registerDefinition(def: SubAgentDefinition): void
  unregisterDefinition(name: string): void
  getDefinition(name: string): SubAgentDefinition | undefined
  getDefinitions(): SubAgentDefinition[]

  // --- Lifecycle ---
  createInstance(task: DelegationTask): SubAgentInstance
  executeTask(task: DelegationTask): Promise<DelegationResult>
  executePlan(plan: ExecutionPlan): Promise<DelegationResult[]>

  // --- Instance access ---
  getInstance(taskId: string): SubAgentInstance | undefined
  getInstances(): SubAgentInstance[]

  // --- Instance control (proxied) ---
  pauseInstance(taskId: string): Promise<void>
  resumeInstance(taskId: string): Promise<void>
  cancelInstance(taskId: string): Promise<void>
  queryInstance(taskId: string, request: QueryRequest): Promise<QueryResponse>
  summarizeInstance(taskId: string, options?: SummarizerOptions): ConversationSummary | null

  // --- RPC Adapter (proxied to instance) ---
  promptInstance(taskId: string, message: string, options?: { images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" }): Promise<void>
  steerInstance(taskId: string, message: string, images?: ImageContent[]): Promise<void>
  abortInstance(taskId: string): Promise<void>
  getInstanceState(taskId: string): SubAgentRpcState
  setInstanceModel(taskId: string, model: Model<any>): Promise<void>
  cycleInstanceModel(taskId: string): Promise<{ model: Model<any>; thinkingLevel: ThinkingLevel; isScoped: boolean } | null>
  getInstanceMessages(taskId: string): AgentMessage[]
  instanceBash(taskId: string, command: string): Promise<BashResult>
  compactInstance(taskId: string, customInstructions?: string): Promise<CompactionResult>

  // --- Events ---
  getEventBus(): SubAgentEventBus

  // --- Cleanup ---
  dispose(): Promise<void>
  getArtifactsDir(): string
}
```

### R9.1 — Controller RPC Proxy Methods

The controller provides convenience methods that proxy to the instance's RPC adapter. For example:

```typescript
async promptInstance(taskId: string, message: string, options?: PromptOptions): Promise<void> {
  const instance = this.getInstance(taskId)
  if (!instance) throw new Error(`Instance "${taskId}" not found`)
  return instance.prompt(message, options)
}
```

All RPC adapter methods on `SubAgentInstance` are also exposed through the controller for unified access.

---

## R10: Pre-built Definitions (`src/definitions/`)

### R10.1 — `planner.ts`

```typescript
export const plannerDefinition: SubAgentDefinition = {
  name: "planner",
  description: "Analysis and planning sub-agent, read-only",
  systemPrompt: `You are a planning specialist...`,
  capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
  tools: ["read", "glob", "grep", "bash"],
  thinkingLevel: "medium",
  allowQuery: true,
  verboseTools: false
}
```

### R10.2 — `executor.ts`

```typescript
export const executorDefinition: SubAgentDefinition = {
  name: "executor",
  description: "Full-stack implementation sub-agent",
  systemPrompt: `You are an implementation specialist...`,
  capabilities: { canEdit: true, canExecute: true, canWrite: true, canResearch: false },
  thinkingLevel: "high",
  allowQuery: true,
  verboseTools: true
}
```

### R10.3 — `analyzer.ts`

```typescript
export const analyzerDefinition: SubAgentDefinition = {
  name: "analyzer",
  description: "Codebase analysis and research sub-agent",
  systemPrompt: `You are a codebase analyst...`,
  capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
  tools: ["read", "glob", "grep", "bash"],
  disabledTools: ["edit", "write"],
  thinkingLevel: "low",
  allowQuery: true,
  verboseTools: false
}
```

### R10.4 — `reviewer.ts`

```typescript
export const reviewerDefinition: SubAgentDefinition = {
  name: "reviewer",
  description: "Code review and validation sub-agent",
  systemPrompt: `You are a code reviewer...`,
  capabilities: { canEdit: false, canExecute: true, canWrite: false, canResearch: false },
  tools: ["read", "glob", "grep", "bash"],
  disabledTools: ["edit", "write", "multi-edit"],
  thinkingLevel: "medium",
  allowQuery: true,
  verboseTools: false
}
```

### R10.5 — `index.ts`

```typescript
export { plannerDefinition } from "./planner.js"
export { executorDefinition } from "./executor.js"
export { analyzerDefinition } from "./analyzer.js"
export { reviewerDefinition } from "./reviewer.js"

export const BUILTIN_DEFINITIONS: SubAgentDefinition[] = [
  plannerDefinition,
  executorDefinition,
  analyzerDefinition,
  reviewerDefinition
]
```

---

## R11: Extension Entry Point (`src/extensions/subagents/index.ts`)

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { SubAgentController } from "../../controller.js"
import { BUILTIN_DEFINITIONS } from "../../definitions/index.js"

export default function subagentsExtension(pi: ExtensionAPI) {
  const controller = new SubAgentController({
    definitions: BUILTIN_DEFINITIONS,
    cwd: process.cwd(),
    artifactsDir: ".delegations"
  })

  // Forward events as custom messages
  controller.getEventBus().on("*", (event) => {
    pi.sendMessage({
      customType: "subagent-event",
      content: JSON.stringify(event),
      display: false,
      details: { event }
    }, { triggerTurn: false })
  })

  // Commands
  pi.registerCommand("delegate", { ... })
  pi.registerCommand("orchestrate", { ... })
  pi.registerCommand("subagent-query", { ... })
  pi.registerCommand("subagent-status", { ... })
  pi.registerCommand("subagent-summary", { ... })
  pi.registerCommand("subagent-pause", { ... })
  pi.registerCommand("subagent-resume", { ... })
  pi.registerCommand("subagent-cancel", { ... })
  pi.registerCommand("subagent-prompt", { ... })      // NEW: direct prompt
  pi.registerCommand("subagent-steer", { ... })       // NEW: steer
  pi.registerCommand("subagent-abort", { ... })       // NEW: abort
  pi.registerCommand("subagent-state", { ... })       // NEW: get_state
  pi.registerCommand("subagent-bash", { ... })        // NEW: bash

  // Tools
  pi.registerTool({ name: "delegate_task", ... })
  pi.registerTool({ name: "run_execution_plan", ... })
  pi.registerTool({ name: "query_subagent", ... })
  pi.registerTool({ name: "summarize_subagent", ... })
  pi.registerTool({ name: "control_subagent", ... })
  pi.registerTool({ name: "prompt_subagent", ... })   // NEW
  pi.registerTool({ name: "steer_subagent", ... })    // NEW
  pi.registerTool({ name: "get_subagent_state", ... }) // NEW
}
```

### R11.1 — New Commands (RPC Adapter exposure)

| Command | Usage | Maps to |
|---------|-------|---------|
| `/subagent-prompt` | `/subagent-prompt <task-id> <message>` | `instance.prompt()` |
| `/subagent-steer` | `/subagent-steer <task-id> <message>` | `instance.steer()` |
| `/subagent-abort` | `/subagent-abort <task-id>` | `instance.abort()` |
| `/subagent-state` | `/subagent-state <task-id>` | `instance.getRpcState()` |
| `/subagent-bash` | `/subagent-bash <task-id> <command>` | `instance.bash()` |

### R11.2 — New Tools (RPC Adapter exposure)

**`prompt_subagent`**:
```typescript
{ task_id: Type.String(), message: Type.String(), streaming_behavior: Type.Optional(StringEnum(["steer", "followUp"])) }
```

**`steer_subagent`**:
```typescript
{ task_id: Type.String(), message: Type.String() }
```

**`get_subagent_state`**:
```typescript
{ task_id: Type.String() }
```
Returns `SubAgentRpcState`.

---

## R12: Public API Exports (`src/index.ts`)

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

---

## R13: Non-functional Requirements

### R13.1 — Error Handling
- All async functions handle errors gracefully
- Timeout errors clean up the session
- Cycle detection in dependency graph produces clear errors
- Query timeout rejects with `failed: true`, does not crash sub-agent
- RPC adapter methods throw clear error if session not ready

### R13.2 — Resource Cleanup
- Isolated worktrees always cleaned up (even on error/crash)
- Active sessions shut down if controller is disposed
- `try/finally` for all resource lifecycle
- `SubAgentInstance.dispose()` is idempotent

### R13.3 — Type Safety
- No `any` types
- Import types from peer dependencies
- Use `typebox` schemas for tool parameters

### R13.4 — Configurability
- All defaults overridable
- No hardcoded paths or keys

### R13.5 — Observability
- Every lifecycle change emits an event
- Every tool execution emits an event (if `verboseTools`)
- Event logs written to `.delegations/<taskId>.events.jsonl`
- Controller exposes `getInstances()` for inspection

### R13.6 — Thread Safety
- `SubAgentInstance` methods are sequential
- State transitions are atomic (check-and-set)
- Query responses matched by `queryId`

### R13.7 — Isolation
- Each `SubAgentInstance` has its own `AgentSession`
- No shared state between instances except the controller's registry
- RPC adapter methods only affect their own instance
- Worktree isolation respected per-definition
