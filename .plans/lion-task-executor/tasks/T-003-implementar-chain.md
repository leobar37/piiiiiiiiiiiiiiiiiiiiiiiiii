# T-003: Implementar Estrategia Chain

## Objetivo
Crear la lógica de ejecución en cadena con paso de output entre tareas.

## Archivo Nuevo: `packages/subagents/src/execution/chain.ts`

```typescript
import type { SubAgentInstance } from "../instance.js";
import type { DelegationResult, DelegationTask, SubAgentEvent } from "../types.js";

export interface ChainOptions {
  passOutputToNext?: boolean;
  outputMode?: "append" | "replace" | "template";
  template?: string;
  stopOnFailure?: boolean;
}

export async function executeChain(
  instances: SubAgentInstance[],
  tasks: DelegationTask[],
  options: ChainOptions = {},
  onEvent?: (event: SubAgentEvent) => void,
): Promise<DelegationResult[]> {
  const {
    passOutputToNext = true,
    outputMode = "append",
    template = "Previous result: {{output}}\n\n{{prompt}}",
    stopOnFailure = true,
  } = options;

  const results: DelegationResult[] = [];
  let previousOutput = "";

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    let task = tasks[i];

    if (passOutputToNext && i > 0) {
      task = injectOutput(task, previousOutput, outputMode, template);
    }

    // Actualizar la tarea de la instancia con el prompt modificado
    // Nota: esto requiere que SubAgentInstance permita actualizar la tarea
    // o que se cree una nueva instancia con la tarea modificada

    const result = await instance.start();
    results.push(result);
    previousOutput = result.summary;

    if (stopOnFailure && result.status !== "completed") {
      break;
    }
  }

  return results;
}

function injectOutput(
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
      return {
        ...task,
        prompt: template.replace("{{output}}", output).replace("{{prompt}}", task.prompt),
      };
  }
}
```

## Actualizar `packages/subagents/src/execution/execute.ts`

```typescript
import type { SubAgentInstance } from "../instance.js";
import type { DelegationResult, ExecutionPlan, SubAgentEvent } from "../types.js";
import { executeChain } from "./chain.js";
import { executeParallel } from "./parallel.js";
import { executeSequential } from "./sequential.js";

export async function execute(
  plan: ExecutionPlan,
  instances: SubAgentInstance[],
  onEvent?: (event: SubAgentEvent) => void,
): Promise<DelegationResult[]> {
  switch (plan.strategy) {
    case "sequential":
      return executeSequential(instances, onEvent);
    case "parallel":
      return executeParallel(instances, onEvent);
    case "chain":
      return executeChain(instances, plan.tasks, plan.chainOptions, onEvent);
    default:
      throw new Error(`Unknown execution strategy: ${(plan as { strategy: string }).strategy}`);
  }
}
```

## Actualizar `packages/subagents/src/execution/index.ts`

```typescript
export { execute } from "./execute.js";
export { executeChain, type ChainOptions } from "./chain.js";
export { executeParallel } from "./parallel.js";
export { executeSequential } from "./sequential.js";
```

## Validación

- [ ] `executeChain` pasa output entre tareas
- [ ] `stopOnFailure` detiene el chain si una tarea falla
- [ ] `outputMode: "append"` añade el output al prompt
- [ ] `outputMode: "replace"` reemplaza el prompt con el output
- [ ] `outputMode: "template"` usa el template con placeholders

## Notas

- `injectOutput` es pura (no muta la tarea original)
- El chain requiere que las instancias ya estén creadas; la inyección de output se hace antes de `start()`
- Considerar si `SubAgentInstance` necesita un método para actualizar la tarea antes de `start()`
