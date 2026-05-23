# T-002: Implementar Controlador de Ejecución Paralela

## Objetivo
Crear la función que ejecuta múltiples subagentes en paralelo con control de concurrencia, siguiendo el patrón de `pi-subagents`.

## Archivos a Crear/Modificar

### 1. `packages/extensions/src/extensions/lion/subagents/parallel.ts` (nuevo)

Implementar la función principal:

```typescript
import type { DelegationResult, DelegationTask, SubAgentController } from "@local/pi-subagents";
import type { LionEventBus } from "../events/bus.js";
import { LionEvents } from "../events/defs.js";
import type {
  LionParallelResult,
  LionParallelTask,
  LionParallelTaskResult,
  LionPlanningSubagentRole,
} from "../types.js";

export interface RunParallelDelegationOptions {
  controller: SubAgentController;
  bus: LionEventBus;
  runId: string;
  planSlug: string;
  planPath: string;
  tasks: LionParallelTask[];
  concurrency: number;
}

export async function runParallelDelegation(
  options: RunParallelDelegationOptions,
): Promise<LionParallelResult> {
  const { controller, bus, runId, planSlug, planPath, tasks, concurrency } = options;

  bus.publish(LionEvents.parallelStart, {
    runId,
    planSlug,
    planPath,
    taskCount: tasks.length,
    concurrency,
  });

  // Semáforo simple para control de concurrencia
  const executing = new Set<Promise<void>>();
  const results: LionParallelTaskResult[] = new Array(tasks.length);

  async function executeTask(index: number, task: LionParallelTask): Promise<void> {
    const taskId = `${runId}-parallel-${index}`;

    bus.publish(LionEvents.parallelTaskStart, {
      runId,
      planSlug,
      planPath,
      index,
      title: task.title,
      agent: task.agent,
    });

    const delegationTask: DelegationTask = {
      id: taskId,
      definition: task.agent,
      description: task.title,
      prompt: task.prompt,
      systemPromptMode: "append",
      capabilities: {
        canEdit: false,
        canWrite: false,
        canExecute: false,
        canResearch: true,
      },
      disabledTools: ["edit", "write", "multi-edit"],
    };

    try {
      const result: DelegationResult = await controller.executeTask(delegationTask);
      results[index] = {
        index,
        title: task.title,
        agent: task.agent,
        status: result.status,
        summary: result.summary,
        taskId: result.taskId,
      };

      bus.publish(LionEvents.parallelTaskEnd, {
        runId,
        planSlug,
        planPath,
        index,
        title: task.title,
        agent: task.agent,
        status: result.status,
        summary: result.summary,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results[index] = {
        index,
        title: task.title,
        agent: task.agent,
        status: "failed",
        summary: errorMessage,
        error: errorMessage,
        taskId,
      };

      bus.publish(LionEvents.parallelTaskEnd, {
        runId,
        planSlug,
        planPath,
        index,
        title: task.title,
        agent: task.agent,
        status: "failed",
        summary: errorMessage,
      });
    }
  }

  // Ejecutar con control de concurrencia
  const queue = tasks.map((task, index) => ({ task, index }));
  let cursor = 0;

  async function pump(): Promise<void> {
    while (cursor < queue.length) {
      const { task, index } = queue[cursor++];
      const promise = executeTask(index, task).finally(() => {
        executing.delete(promise);
      });
      executing.add(promise);

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }
  }

  await pump();
  await Promise.all(executing);

  const completedCount = results.filter((r) => r.status === "completed").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  const parallelResult: LionParallelResult = {
    runId,
    tasks: results,
    completedCount,
    failedCount,
  };

  bus.publish(LionEvents.parallelComplete, {
    runId,
    planSlug,
    planPath,
    result: parallelResult,
  });

  return parallelResult;
}
```

### 2. `packages/extensions/src/extensions/lion/subagents/index.ts`

Exportar la nueva función:

```typescript
export { runParallelDelegation } from "./parallel.js";
```

## Validación

- [ ] La función compila sin errores
- [ ] El control de concurrencia funciona correctamente (no más de N tareas simultáneas)
- [ ] Si una tarea falla, las demás continúan
- [ ] Todos los resultados se agregan correctamente

## Notas

- El semáforo implementado es intencionalmente simple para evitar dependencias externas.
- Cada tarea paralela usa `capabilities: { canEdit: false, canWrite: false, canExecute: false }` para mantenerlos read-only.
- Los `disabledTools` incluyen "edit", "write", "multi-edit" como capa adicional de seguridad.
