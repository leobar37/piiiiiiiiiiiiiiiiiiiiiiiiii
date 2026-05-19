# T10: Pre-built Definitions

## Goal
4 built-in sub-agent definitions with capabilities.

## Files

### `src/definitions/planner.ts`
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

### `src/definitions/executor.ts`
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

### `src/definitions/analyzer.ts`
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

### `src/definitions/reviewer.ts`
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

### `src/definitions/index.ts`
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

## Validation
- All definitions compile
- BUILTIN_DEFINITIONS array is valid
