# T-002: Crear TaskExecutor en packages/subagents

## Objetivo
Crear una clase `TaskExecutor` que encapsule la ejecución de tareas de subagentes con soporte para parallel, sequential, y chain.

## Archivo Nuevo: `packages/subagents/src/task-executor.ts`

```typescript
import type { SubAgentController } from "./controller.js";
import type { DelegationResult, DelegationTask, ExecutionPlan, SubAgentEvent } from "./types.js";

export interface TaskExecutorOptions {
  controller: SubAgentController;
  onEvent?: (event: SubAgentEvent) => void;
}

export interface TaskExecutionResult {
  plan: ExecutionPlan;
  results: DelegationResult[];
  completedAt: number;
}

export class TaskExecutor {
  private controller: SubAgentController;
  private onEvent?: (event: SubAgentEvent) => void;
  private abortController = new AbortController();

  constructor(options: TaskExecutorOptions) {
    this.controller = options.controller;
    this.onEvent = options.onEvent;
  }

  async execute(plan: ExecutionPlan): Promise<TaskExecutionResult> {
    const startedAt = Date.now();
    this.abortController = new AbortController();

    switch (plan.strategy) {
      case "sequential":
        return this.executeSequential(plan, startedAt);
      case "parallel":
        return this.executeParallel(plan, startedAt);
      case "chain":
        return this.executeChain(plan, startedAt);
      default:
        throw new Error(`Unknown execution strategy: ${(plan as { strategy: string }).strategy}`);
    }
  }

  cancel(): void {
    this.abortController.abort();
  }

  private async executeSequential(plan: ExecutionPlan, startedAt: number): Promise<TaskExecutionResult> {
    const results: DelegationResult[] = [];

    for (const task of plan.tasks) {
      if (this.abortController.signal.aborted) {
        break;
      }
      const result = await this.executeTask(task);
      results.push(result);
    }

    return { plan, results, completedAt: Date.now() };
  }

  private async executeParallel(plan: ExecutionPlan, startedAt: number): Promise<TaskExecutionResult> {
    const concurrency = plan.concurrency ?? 3;
    const executing = new Set<Promise<void>>();
    const results: DelegationResult[] = new Array(plan.tasks.length);

    async function executeTaskAtIndex(index: number, task: DelegationTask, executor: TaskExecutor): Promise<void> {
      const result = await executor.executeTask(task);
      results[index] = result;
    }

    const queue = plan.tasks.map((task, index) => ({ task, index }));
    let cursor = 0;

    async function pump(executor: TaskExecutor): Promise<void> {
      while (cursor < queue.length) {
        if (executor.abortController.signal.aborted) break;
        const { task, index } = queue[cursor++];
        const promise = executeTaskAtIndex(index, task, executor).finally(() => {
          executing.delete(promise);
        });
        executing.add(promise);

        if (executing.size >= concurrency) {
          await Promise.race(executing);
        }
      }
    }

    await pump(this);
    await Promise.all(executing);

    return { plan, results, completedAt: Date.now() };
  }

  private async executeChain(plan: ExecutionPlan, startedAt: number): Promise<TaskExecutionResult> {
    const options = plan.chainOptions ?? {};
    const passOutputToNext = options.passOutputToNext ?? true;
    const outputMode = options.outputMode ?? "append";
    const template = options.template ?? "Previous result: {{output}}\n\n{{prompt}}";
    const stopOnFailure = options.stopOnFailure ?? true;

    const results: DelegationResult[] = [];
    let previousOutput = "";

    for (let i = 0; i < plan.tasks.length; i++) {
      if (this.abortController.signal.aborted) {
        break;
      }

      let task = plan.tasks[i];

      if (passOutputToNext && i > 0) {
        task = this.injectOutput(task, previousOutput, outputMode, template);
      }

      const result = await this.executeTask(task);
      results.push(result);
      previousOutput = result.summary;

      if (stopOnFailure && result.status !== "completed") {
        break;
      }
    }

    return { plan, results, completedAt: Date.now() };
  }

  private injectOutput(
    task: DelegationTask,
    output: string,
    mode: "append" | "replace" | "template",
    template: string,
  ): DelegationTask {
    switch (mode) {
      case "append":
        return { ...task, prompt: `${task.prompt}\n\nPrevious result:\n${output}` };
      case "replace":
        return { ...task, prompt: output };
      case "template":
        return { ...task, prompt: template.replace("{{output}}", output).replace("{{prompt}}", task.prompt) };
    }
  }

  private async executeTask(task: DelegationTask): Promise<DelegationResult> {
    const instance = this.controller.createInstance(task);

    // Suscribirse a eventos de esta instancia
    const unsubscribe = this.controller.getEventBus().on("*", (event: SubAgentEvent) => {
      if ("instanceId" in event && event.instanceId === instance.instanceId) {
        this.onEvent?.(event);
      }
    });

    try {
      const result = await instance.start();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        taskId: task.id,
        agent: task.definition,
        status: "failed",
        summary: errorMessage,
        duration: 0,
        turnCount: 0,
        finalState: instance.getState(),
      };
    } finally {
      unsubscribe();
    }
  }
}
```

## Actualizar `packages/subagents/src/index.ts`

```typescript
export { TaskExecutor } from "./task-executor.js";
export type { TaskExecutorOptions, TaskExecutionResult } from "./task-executor.js";
```

## Validación

- [ ] `TaskExecutor` compila sin errores
- [ ] `executeSequential` ejecuta tareas una tras otra
- [ ] `executeParallel` respeta el límite de concurrencia
- [ ] `executeChain` pasa output entre tareas
- [ ] `cancel()` aborta la ejecución
- [ ] Los eventos se emiten en tiempo real

## Notas

- `TaskExecutor` no reemplaza `executePlan()` en `SubAgentController`, es una capa superior
- Las instancias se crean vía `controller.createInstance()` y se retienen en `controller.instances`
- El orquestador puede acceder a instancias retenidas vía `controller.getInstance(taskId)`
