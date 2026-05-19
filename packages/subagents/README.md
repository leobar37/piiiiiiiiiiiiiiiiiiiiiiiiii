# @local/pi-subagents

Sub-agent controller library for `pi-coding-agent`. Orchestrates multiple isolated agent sessions with full lifecycle control, bidirectional events, runtime interrogation, conversation summarization, and an RPC-style adapter API.

This is a **library package** — it does not register commands or tools in a parent pi session. It is consumed programmatically by an orchestrator that decides when and how to spawn, control, and observe sub-agents.

---

## Architecture

```
SubAgentController
  ├── definitions: Map<string, SubAgentDefinition>     # Base templates
  ├── instances:   Map<string, SubAgentInstance>       # Live sessions
  └── eventBus:    SubAgentEventBus                    # Typed pub/sub

SubAgentInstance (one per task)
  ├── AgentSession (from pi-coding-agent)
  ├── Lifecycle state machine (created → running → completed/failed/cancelled)
  ├── Event forwarding (AgentSessionEvent → SubAgentEvent)
  ├── Query handler (interrogation via steer())
  ├── Summarizer (reads sessionManager branch, formats as markdown)
  └── RPC Adapter (direct methods: prompt, steer, bash, compact, setModel, ...)
```

---

## Core Concepts

### Definitions are Templates

A `SubAgentDefinition` is a **base template** — it provides defaults for system prompt, capabilities, tools, and runtime limits. It does not dictate what a specific task should do.

```typescript
const executorDefinition: SubAgentDefinition = {
  name: "executor",
  description: "Task execution worker",
  systemPrompt: "You are a task executor. Follow the instructions provided to you precisely.",
  capabilities: { canEdit: true, canExecute: true, canWrite: true, canResearch: false },
  thinkingLevel: "high",
  allowQuery: true,
  verboseTools: true,
}
```

### Tasks Provide Dynamic Overrides

A `DelegationTask` merges with its base definition at runtime. The orchestrator can override **every** aspect of the sub-agent's behavior per task:

```typescript
const task: DelegationTask = {
  id: "fix-auth-bug",
  definition: "executor",
  description: "Fix null pointer in auth.ts",
  prompt: "Fix the null pointer exception in src/auth.ts line 45. Do not touch any other files.",
  systemPrompt: "You are a bug-fix specialist. Focus on minimal, safe fixes. Always run tests before declaring completion.",
  systemPromptMode: "append",
  capabilities: { canEdit: true, canExecute: true, canWrite: false, canResearch: false },
  tools: ["read", "edit", "bash"],
  thinkingLevel: "high",
  maxTurns: 10,
  outputArtifact: ".delegations/fix-auth-bug.output.md",
}
```

The `config-resolver.ts` module performs the merge:

| Field | Merge rule |
|-------|-----------|
| `description` | `task.description ?? definition.description` |
| `systemPrompt` | `merge(definition.systemPrompt, task.systemPrompt, task.systemPromptMode)` |
| `capabilities` | `{ ...definition.capabilities, ...task.capabilities }` |
| `tools` | `task.tools ?? definition.tools` |
| `disabledTools` | `[...definition.disabledTools, ...task.disabledTools]` |
| `model`, `thinkingLevel`, `maxTurns`, `timeout`, `allowQuery`, `verboseTools` | `task.* ?? definition.*` |

---

## Quick Start

```typescript
import { SubAgentController, BUILTIN_DEFINITIONS } from "@local/pi-subagents";

const controller = new SubAgentController({
  definitions: BUILTIN_DEFINITIONS,
  cwd: process.cwd(),
  artifactsDir: ".delegations",
  onEvent: (event) => {
    console.log(`[${event.type}] ${event.instanceId}`);
  },
});

// Execute a single task
const result = await controller.executeTask({
  id: "audit-deps",
  definition: "analyzer",
  description: "Audit package.json for outdated dependencies",
  prompt: "Read package.json and report all dependencies that have major version updates available.",
  systemPromptMode: "append",
  outputArtifact: ".delegations/audit-deps.output.md",
});

console.log(result.status, result.summary);
```

---

## Interrogation (query a running sub-agent)

Ask a question to a sub-agent that is still running. It receives the question via `steer()` and the answer is captured from the next assistant message.

```typescript
const answer = await controller.queryInstance("audit-deps", {
  queryId: "q-1",
  question: "Which dependency has the most outdated version?",
  timeoutMs: 30000,
});

console.log(answer.answer);   // The assistant's response
console.log(answer.failed);   // true if timed out or not running
```

---

## Summarization

Extract a markdown summary of the sub-agent's recent conversation. No LLM call — it reads the session branch and formats it.

```typescript
const summary = controller.summarizeInstance("audit-deps", {
  maxMessages: 20,
  maxTurns: 5,
  includeTools: true,
});

console.log(summary.text);
console.log(summary.turnCount, summary.toolCallCount);
```

---

## RPC Adapter API

Every `SubAgentInstance` exposes the full RPC-mode API as direct programmatic methods. The controller proxies them by `taskId`.

### Prompting
```typescript
await controller.promptInstance("audit-deps", "Check devDependencies too");
await controller.steerInstance("audit-deps", "Focus on security-related updates");
await controller.abortInstance("audit-deps");
```

### Model & Thinking
```typescript
await controller.setInstanceModel("audit-deps", myModel);
await controller.cycleInstanceModel("audit-deps");
controller.instanceSetThinkingLevel("audit-deps", "low");
```

### Bash
```typescript
const result = await controller.instanceBash("audit-deps", "npm outdated");
console.log(result.output, result.exitCode);
```

### Compaction
```typescript
await controller.compactInstance("audit-deps", "Summarize the audit findings so far");
```

### Introspection
```typescript
const state = controller.getInstanceState("audit-deps");
console.log(state.model?.id, state.isStreaming, state.messageCount);

const messages = controller.getInstanceMessages("audit-deps");
```

---

## Execution Strategies

Execute multiple tasks with dependency resolution:

```typescript
const plan: ExecutionPlan = {
  strategy: "dependency-graph",
  tasks: [
    { id: "scout", definition: "analyzer", prompt: "Map the auth flow", outputArtifact: "scout.md" },
    { id: "plan", definition: "planner", prompt: "Plan the migration", outputArtifact: "plan.md", dependsOn: ["scout"] },
    { id: "implement", definition: "executor", prompt: "Implement the plan", outputArtifact: "impl.md", dependsOn: ["plan"] },
    { id: "review", definition: "reviewer", prompt: "Review the implementation", outputArtifact: "review.md", dependsOn: ["implement"] },
  ],
};

const results = await controller.executePlan(plan);
```

Strategies: `"sequential"`, `"parallel"`, `"dependency-graph"`.

---

## Event Model

All sub-agents emit events through a shared `SubAgentEventBus`.

| Event | Emitted when |
|-------|-------------|
| `lifecycle.change` | State transitions (created → starting → running → ...) |
| `task.start` | Agent loop starts |
| `task.end` | Agent loop ends (with result) |
| `turn.complete` | Each LLM turn finishes |
| `tool.execute` | Each tool call starts/ends (if `verboseTools`) |
| `progress.update` | Assistant produces text (first 200 chars) |
| `query.response` | A query receives an answer |
| `summary.available` | A summary is generated |
| `error` | Error (fatal or non-fatal) |

Subscribe:

```typescript
controller.getEventBus().on("task.end", (event) => {
  console.log(`${event.taskId} finished with ${event.result.status}`);
});

controller.getEventBus().on("*", (event) => {
  // All events
});
```

---

## Built-in Definitions

| Name | Default capabilities | Default tools | Purpose |
|------|---------------------|---------------|---------|
| `planner` | read-only | `read`, `glob`, `grep`, `bash` | Analyze and plan |
| `executor` | full (read, execute, write) | all | Execute tasks (blank slate) |
| `analyzer` | read-only | `read`, `glob`, `grep`, `bash` | Investigate and report |
| `reviewer` | read + execute | `read`, `glob`, `grep`, `bash` | Review without editing |

All built-ins are templates. The orchestrator should pass task-specific `systemPrompt`, `capabilities`, and `tools` via `DelegationTask` overrides.

---

## Lifecycle Control

```typescript
await controller.pauseInstance("audit-deps");   // Abort current turn, state → paused
await controller.resumeInstance("audit-deps");  // Send "Continue.", state → running
await controller.cancelInstance("audit-deps");  // Abort, state → cancelled
```

---

## Artifacts

Each task produces artifacts under `.delegations/` (or the configured `artifactsDir`):

```
.delegations/
├── <taskId>.md           # Delegation instructions (input)
├── <taskId>.result.md    # Result summary (output)
└── <taskId>.events.jsonl # NDJSON event log
```

---

## Type Exports

```typescript
import type {
  SubAgentController,
  SubAgentInstance,
  SubAgentEventBus,
  SubAgentSummarizer,
  SubAgentDefinition,
  SubAgentCapabilities,
  EffectiveSubAgentConfig,
  DelegationTask,
  ExecutionPlan,
  DelegationResult,
  QueryRequest,
  QueryResponse,
  ConversationSummary,
  SubAgentRpcState,
  SubAgentEvent,
  SubAgentEventMap,
  SubAgentState,
} from "@local/pi-subagents";
```

---

## Build

```bash
cd packages/subagents
bun run build       # Bundle to dist/
bun run watch       # Watch mode
```
