# T5: Artifact I/O

## Goal
Read/write `.delegations/` markdown + NDJSON event logs.

## Files

### `src/artifacts/reader.ts`
```typescript
export function readArtifact(artifactsDir: string, path: string): string
export function readResultArtifact(artifactsDir: string, taskId: string): string | null
export function artifactExists(artifactsDir: string, path: string): boolean
export function listResultArtifacts(artifactsDir: string): string[]
```

### `src/artifacts/writer.ts`
```typescript
export function writeDelegationArtifact(artifactsDir: string, task: DelegationTask, definition: SubAgentDefinition, contextFiles: Map<string, string>): string
export function writeResultArtifact(artifactsDir: string, taskId: string, result: { status: string; summary: string; outputPath: string; turnCount: number; duration: number }): void
export function writeEventLog(artifactsDir: string, taskId: string, events: SubAgentEvent[]): void
export function ensureDelegationsDir(artifactsDir: string): void
```

### `src/artifacts/index.ts`
Re-export all.

## Artifact Formats

**Input** (`.delegations/<taskId>.md`):
```markdown
# Delegation: <taskId>
- **Agent**: <definition.name>
- **Created**: <ISO timestamp>
- **Output artifact**: <outputArtifact>
## Goal
<task.prompt>
## Context
<injected files>
## Constraints
- Write final result to: `<outputArtifact>`
- Available tools: <list>
- Model: <model or inherited>
- Max turns: <maxTurns or unlimited>
- Timeout: <timeout or none>
```

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

**Event log** (`.delegations/<taskId>.events.jsonl`): NDJSON, one event per line.

## Validation
- Unit test: write and read roundtrip
