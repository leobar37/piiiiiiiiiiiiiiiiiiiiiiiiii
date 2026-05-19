# T6: Session Factory

## Goal
Wraps `createAgentSession` with personality injection via ExtensionFactory.

## File: `src/session-factory.ts`

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

export async function createSubAgentSession(options: CreateSubAgentSessionOptions): Promise<CreateSubAgentSessionResult>
```

## Implementation Steps

1. **Resolve cwd**
   - If `definition.cwd`, resolve against project root
   - If `definition.isolated`, create temp git worktree via `git worktree add --detach`

2. **Create DefaultResourceLoader** with inline extension factory

3. **Inline extension factory** (`subAgentPersonalityFactory`):
   - On `session_start`: restrict tools via `setActiveTools()`
   - On `before_agent_start`: inject `definition.systemPrompt`
   - On `session_start`: send delegation instructions as first user message
   - Register `definition.extensionFactory` if provided

4. **Reload loader and create session**
   - `await loader.reload()`
   - `createAgentSession({ resourceLoader: loader, cwd, model, thinkingLevel, ... })`

5. **Return** session + cleanup function

### `buildDelegationInstructions()`
```typescript
function buildDelegationInstructions(task: DelegationTask, definition: SubAgentDefinition): string
```
Formats the delegation prompt with task goal, output path, constraints, tools, model, limits.

## Cleanup
- Isolated worktrees removed via `git worktree remove --force`
- Cleanup runs even if session creation fails mid-way (try/finally)

## Validation
- Verify tool restrictions applied
- Verify cleanup removes worktree
- Edge case: session creation failure → cleanup still runs
