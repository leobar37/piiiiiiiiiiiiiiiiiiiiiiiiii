# T11: Extension Entry Point

## Goal
Extension factory for parent pi session: commands + tools.

## File: `src/extensions/subagents/index.ts`

### Factory Structure
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

  // Register commands
  pi.registerCommand("delegate", { ... })
  pi.registerCommand("orchestrate", { ... })
  pi.registerCommand("subagent-query", { ... })
  pi.registerCommand("subagent-status", { ... })
  pi.registerCommand("subagent-summary", { ... })
  pi.registerCommand("subagent-pause", { ... })
  pi.registerCommand("subagent-resume", { ... })
  pi.registerCommand("subagent-cancel", { ... })
  pi.registerCommand("subagent-prompt", { ... })
  pi.registerCommand("subagent-steer", { ... })
  pi.registerCommand("subagent-abort", { ... })
  pi.registerCommand("subagent-state", { ... })
  pi.registerCommand("subagent-bash", { ... })

  // Register tools
  pi.registerTool({ name: "delegate_task", ... })
  pi.registerTool({ name: "run_execution_plan", ... })
  pi.registerTool({ name: "query_subagent", ... })
  pi.registerTool({ name: "summarize_subagent", ... })
  pi.registerTool({ name: "control_subagent", ... })
  pi.registerTool({ name: "prompt_subagent", ... })
  pi.registerTool({ name: "steer_subagent", ... })
  pi.registerTool({ name: "get_subagent_state", ... })
}
```

### Commands

| Command | Usage | Handler |
|---------|-------|---------|
| `/delegate` | `/delegate <definition> <prompt> [--input <file>...] [--output <path>]` | `controller.executeTask()` |
| `/orchestrate` | `/orchestrate <plan-path>` | Read plan file, `controller.executePlan()` |
| `/subagent-query` | `/subagent-query <task-id> <question>` | `controller.queryInstance()` |
| `/subagent-status` | `/subagent-status [task-id]` | Show state via `getInstance()` / `getInstances()` |
| `/subagent-summary` | `/subagent-summary <task-id>` | `controller.summarizeInstance()` |
| `/subagent-pause` | `/subagent-pause <task-id>` | `controller.pauseInstance()` |
| `/subagent-resume` | `/subagent-resume <task-id>` | `controller.resumeInstance()` |
| `/subagent-cancel` | `/subagent-cancel <task-id>` | `controller.cancelInstance()` |
| `/subagent-prompt` | `/subagent-prompt <task-id> <message>` | `controller.promptInstance()` |
| `/subagent-steer` | `/subagent-steer <task-id> <message>` | `controller.steerInstance()` |
| `/subagent-abort` | `/subagent-abort <task-id>` | `controller.abortInstance()` |
| `/subagent-state` | `/subagent-state <task-id>` | `controller.getInstanceState()` |
| `/subagent-bash` | `/subagent-bash <task-id> <command>` | `controller.instanceBash()` |

### Tools (TypeBox schemas)

**`delegate_task`** — `definition`, `id`, `prompt`, `input_artifacts`, `output_artifact`, `depends_on`

**`run_execution_plan`** — `strategy`, `tasks[]`

**`query_subagent`** — `task_id`, `question`, `timeout_ms`

**`summarize_subagent`** — `task_id`, `max_messages`, `max_turns`

**`control_subagent`** — `task_id`, `action` ("pause" | "resume" | "cancel")

**`prompt_subagent`** — `task_id`, `message`, `streaming_behavior`

**`steer_subagent`** — `task_id`, `message`

**`get_subagent_state`** — `task_id`

## Validation
- `bun run build` succeeds
- Extension loads without errors
- Commands appear in `/help`
