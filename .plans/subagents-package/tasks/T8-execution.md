# T8: Execution Strategies

## Goal
Sequential, parallel, dependency-graph execution on SubAgentInstance[].

## Files

### `src/execution/sequential.ts`
```typescript
export async function executeSequential(
  instances: SubAgentInstance[],
  onEvent?: (event: SubAgentEvent) => void
): Promise<DelegationResult[]>
```
- Iterate instances in order
- Before each, check `dependsOn` tasks completed successfully
- If dependency failed/blocked, mark current as `blocked`
- `await instance.start()` for each
- Collect results in order

### `src/execution/parallel.ts`
```typescript
export async function executeParallel(
  instances: SubAgentInstance[],
  onEvent?: (event: SubAgentEvent) => void
): Promise<DelegationResult[]>
```
- Run all concurrently via `Promise.allSettled()`
- Log warning if any task has `dependsOn`
- Return results in task definition order

### `src/execution/dependency-graph.ts`
```typescript
export async function executeDependencyGraph(
  instances: SubAgentInstance[],
  taskMap: Map<string, DelegationTask>,
  onEvent?: (event: SubAgentEvent) => void
): Promise<DelegationResult[]>
```
- Topological sort by `dependsOn`
- Execute each level in parallel
- Wait for all level tasks to complete
- Mark blocked if dependencies failed
- Detect cycles (error if found)

### `src/execution/execute.ts`
```typescript
export async function execute(
  plan: ExecutionPlan,
  instances: SubAgentInstance[],
  onEvent?: (event: SubAgentEvent) => void
): Promise<DelegationResult[]>
```
Dispatcher by `plan.strategy`.

### `src/execution/index.ts`
Re-export all.

## Validation
- Unit test: sequential with mock instances
- Unit test: parallel with mock instances
- Unit test: dependency graph with cycle detection
- Unit test: dependency graph with blocked tasks
