# Context: packages/subagents (v2 — Controller + RPC Adapter)

## Goal

Create `packages/subagents` (`@local/pi-subagents`) as a **sub-agent controller framework** with three layers:

1. **SubAgentController** — orchestrates multiple `SubAgentInstance`s with execution strategies
2. **SubAgentInstance** — wraps one `AgentSession` with:
   - Full lifecycle state machine (`created` → `starting` → `running` → `paused` → `completing` → `completed`/`failed`/`cancelled`/`timed_out`)
   - Bidirectional event emission via typed `SubAgentEventBus`
   - Runtime interrogation (`query()`) — ask a running sub-agent questions mid-flight
   - Conversation summarization (`summarize()`) — extract recent context as markdown
   - **RPC Adapter API** — exposes every RPC-mode command as direct programmatic methods on the instance
3. **EventBus + Summarizer + Artifacts** — shared utilities

The package runs as an extension inside a parent pi session, but the core library is usable standalone.

---

## Codebase Landscape

### 1. Existing Sub-agent Support in pi-coding-agent

The SDK already has primitives we build on top of:

- `createAgentSession()` — creates a fully functional `AgentSession`
- `AgentSession.sendUserMessage()` / `prompt()` — starts the agent loop
- `AgentSession.steer()` — injects a mid-flight user message while streaming
- `AgentSession.followUp()` — queues a follow-up message
- `AgentSession.abort()` — aborts current operation
- `AgentSession.subscribe()` — listen to all `AgentSessionEvent`s
- `sessionManager.getBranch()` / `getEntries()` — read conversation history
- `ExtensionAPI` + `ExtensionFactory` — inject personality, restrict tools, intercept events
- `AgentSession.executeBash()` — run bash in session's cwd
- `AgentSession.setModel()` / `cycleModel()` / `setThinkingLevel()` — runtime config
- `AgentSession.compact()` — manual compaction
- `AgentSession.getSessionStats()` / `messages` / `getLastAssistantText()` — introspection
- `AgentSession.setActiveToolsByName()` — dynamic tool restriction

**Key insight**: `steer()` is the interrogation primitive. We can send a "question" as a steering message and capture the assistant's response via event subscription.

### 2. Session Event Model (from agent-session.ts)

```
subscribe(listener) → AgentSessionEvent:
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start"; turnIndex: number }
  | { type: "turn_end"; turnIndex: number; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean }
  | { type: "queue_update"; steering: string[]; followUp: string[] }
```

We map these into our richer `SubAgentEvent` domain model.

### 3. RPC Mode API (from rpc-mode.ts + rpc-types.ts)

The RPC mode exposes a complete headless API via JSONL over stdio. We **wrap** the same capabilities as direct programmatic methods on `SubAgentInstance`:

**Prompting**: `prompt`, `steer`, `follow_up`, `abort`
**State**: `get_state`
**Model**: `set_model`, `cycle_model`, `get_available_models`
**Thinking**: `set_thinking_level`, `cycle_thinking_level`
**Queue modes**: `set_steering_mode`, `set_follow_up_mode`
**Compaction**: `compact`, `set_auto_compaction`
**Retry**: `set_auto_retry`, `abort_retry`
**Bash**: `bash`, `abort_bash`
**Session**: `get_session_stats`, `export_html`, `switch_session`, `fork`, `clone`, `get_fork_messages`, `get_last_assistant_text`, `set_session_name`
**Messages**: `get_messages`
**Commands**: `get_commands`

Our `SubAgentInstance` exposes all of these as typed methods that delegate directly to the underlying `AgentSession`.

### 4. Extension System

Extensions are loaded via `ExtensionFactory` into `DefaultResourceLoader`. Our `SubAgentInstance` creates an inline extension factory that:
- Injects the sub-agent's system prompt on `before_agent_start`
- Restricts tools on `session_start`
- Forwards all events to the controller's event bus
- Intercepts `agent_end` to signal completion
- Handles `turn_start`/`turn_end` for turn counting

### 5. Goal Extension Pattern (gold standard)

The `goal` extension shows:
- Persistent state via `pi.appendEntry()`
- Lifecycle hooks (`before_agent_start`, `agent_start`, `agent_end`)
- UI status updates
- Custom message injection for continuation
- Token/time accounting

Our sub-agent controller should be equally rigorous.

### 6. Files to Read During Implementation

| File | Purpose |
|------|---------|
| `packages/coding-agent/src/core/sdk.ts` | `createAgentSession`, `CreateAgentSessionOptions` |
| `packages/coding-agent/src/core/agent-session.ts` | `AgentSession`, `steer()`, `subscribe()`, `prompt()`, `executeBash()`, `setModel()`, `compact()`, etc. |
| `packages/coding-agent/src/core/resource-loader.ts` | `DefaultResourceLoader`, `ExtensionFactory` |
| `packages/coding-agent/src/core/extensions/types.ts` | `ExtensionAPI`, event types, `ToolDefinition` |
| `packages/coding-agent/src/core/extensions/runner.ts` | `ExtensionRunner`, event emission |
| `packages/coding-agent/src/core/session-manager.ts` | `SessionManager`, `getBranch()`, entry types |
| `packages/coding-agent/src/modes/rpc/rpc-mode.ts` | RPC command handlers — map to instance methods |
| `packages/coding-agent/src/modes/rpc/rpc-types.ts` | `RpcCommand`, `RpcSessionState`, `RpcResponse` |
| `packages/extensions/src/extensions/goal/index.ts` | Gold standard for stateful extension |
| `packages/extensions/build.ts` | Build script to replicate |

---

## Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Architecture** | Controller + Instance pattern | Each sub-agent is a stateful object with full RPC API |
| **Communication** | In-memory EventBus + filesystem artifacts | Events are real-time; artifacts are durable |
| **Interrogation** | `steer()` + promise-based response capture | Uses native SDK primitive |
| **Summarization** | Read `sessionManager.getBranch()`, format as markdown | Leverages existing persistence, no LLM call |
| **Lifecycle** | State machine with 9 states | Explicit states prevent race conditions |
| **Cancellation** | `AgentSession.abort()` + signal | Native cancellation |
| **RPC Adapter** | Direct method delegation to `AgentSession` | Same granularity as RPC mode but in-memory and isolated |
| **Concurrency** | One `SubAgentInstance` per task, controller holds map | Clear ownership |
| **Query safety** | Only allowed when state is `running` | Prevents queries during init/cleanup |
| **Output mode** | Controller emits structured events; extension maps to TUI | Separation of concerns |
