# T-005: Implementar lion_tasks en Lion

## Objetivo
Crear la tool `lion_tasks` que usa `TaskExecutor` para delegar tareas de subagentes.

## Cambios en `packages/extensions/src/extensions/lion/types.ts`

### Agregar tipos para lion_tasks

```typescript
export type LionTaskStrategy = "parallel" | "sequential" | "chain";

export interface LionTaskConfig {
  definition: string;
  title: string;
  prompt: string;
  capabilities?: Partial<{
    canEdit: boolean;
    canWrite: boolean;
    canExecute: boolean;
    canResearch: boolean;
  }>;
}

export interface LionTaskResult {
  taskId: string;
  title: string;
  definition: string;
  status: DelegationStatus;
  summary: string;
  duration: number;
  turnCount: number;
  error?: string;
}

export interface LionTasksResult {
  runId: string;
  strategy: LionTaskStrategy;
  tasks: LionTaskResult[];
  completedCount: number;
  failedCount: number;
  completedAt: number;
}
```

### Extender LionEventMap

```typescript
"lion.tasks.start": LionEventBase & {
  type: "lion.tasks.start";
  strategy: LionTaskStrategy;
  taskCount: number;
  concurrency?: number;
};
"lion.tasks.complete": LionEventBase & {
  type: "lion.tasks.complete";
  result: LionTasksResult;
};
"lion.tasks.task.start": LionEventBase & {
  type: "lion.tasks.task.start";
  index: number;
  title: string;
  definition: string;
};
"lion.tasks.task.end": LionEventBase & {
  type: "lion.tasks.task.end";
  index: number;
  title: string;
  definition: string;
  status: DelegationStatus;
  summary: string;
};
```

## Cambios en `packages/extensions/src/extensions/lion/tools.ts`

### Definir parámetros

```typescript
const LionTasksParams = Type.Object({
  tasks: Type.Array(
    Type.Object({
      definition: Type.String({ description: "Subagent definition to use (e.g., 'analyzer', 'executor', 'reviewer')" }),
      title: Type.String({ description: "Short title identifying this task" }),
      prompt: Type.String({ description: "Full prompt/instructions for the subagent" }),
      capabilities: Type.Optional(
        Type.Object({
          canEdit: Type.Optional(Type.Boolean()),
          canWrite: Type.Optional(Type.Boolean()),
          canExecute: Type.Optional(Type.Boolean()),
          canResearch: Type.Optional(Type.Boolean()),
        }),
      ),
    }),
    { description: "Array of tasks to execute" },
  ),
  strategy: Type.Union(
    [
      Type.Literal("parallel", { description: "Execute all tasks concurrently" }),
      Type.Literal("sequential", { description: "Execute tasks one after another" }),
      Type.Literal("chain", { description: "Execute sequentially, passing output to next task" }),
    ],
    { description: "Execution strategy" },
  ),
  concurrency: Type.Optional(
    Type.Number({
      description: "Max concurrent tasks for parallel strategy. Default: 3",
      minimum: 1,
      maximum: 10,
    }),
  ),
  chainOptions: Type.Optional(
    Type.Object({
      passOutputToNext: Type.Optional(Type.Boolean({ description: "Pass previous output to next task. Default: true" })),
      outputMode: Type.Optional(
        Type.Union([Type.Literal("append"), Type.Literal("replace"), Type.Literal("template")]),
      ),
      template: Type.Optional(Type.String()),
      stopOnFailure: Type.Optional(Type.Boolean({ description: "Stop chain on failure. Default: true" })),
    }),
  ),
});
```

### Registrar la tool

```typescript
runtime.pi.registerTool({
  name: "lion_tasks",
  label: "Lion Tasks",
  description:
    "Delegate one or more tasks to subagents with configurable execution strategy (parallel, sequential, or chain). Retains instances for follow-up via lion_prompt_subagent.",
  promptSnippet: "Delegate tasks to subagents with parallel, sequential, or chain execution",
  parameters: LionTasksParams,
  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const response = await executeLionTasks(runtime, ctx, params);
    return toToolResult(response);
  },
});
```

### Implementar executeLionTasks

```typescript
export async function executeLionTasks(
  runtime: LionRuntime,
  ctx: ExtensionContext,
  params: {
    tasks: Array<{ definition: string; title: string; prompt: string; capabilities?: Partial<SubAgentCapabilities> }>;
    strategy: "parallel" | "sequential" | "chain";
    concurrency?: number;
    chainOptions?: {
      passOutputToNext?: boolean;
      outputMode?: "append" | "replace" | "template";
      template?: string;
      stopOnFailure?: boolean;
    };
  },
): Promise<LionToolResponse> {
  const activePlanPath = runtime.state.activePlanPath;
  if (!activePlanPath) {
    throw new Error("lion_tasks requires an active plan. Run lion_activate_plan first.");
  }

  rememberLionUiContext(runtime, ctx);

  const runId = createRunId();
  const bus = runtime.events;
  const plan = loadLionPlan(activePlanPath);

  // Crear task sintético para el controller
  const task: LionTask = {
    id: `tasks-${runId}`,
    title: `Task execution (${params.strategy}, ${params.tasks.length} tasks)`,
    file: "task-index.md",
    status: "pending",
    dependencies: [],
    requirements: [],
  };

  const controller = createController(runtime, ctx, runId, plan, task);

  // Iniciar UI para cada tarea
  for (let i = 0; i < params.tasks.length; i++) {
    const taskId = `${runId}-task-${i}`;
    startLionSubagentJob(runtime, {
      runId,
      taskId,
      role: "validator",
      title: params.tasks[i].title,
    });
    startLionSubagentUi(runtime, {
      runId,
      taskId,
      role: "validator",
      title: params.tasks[i].title,
    });
  }
  renderLionSubagentWidget(runtime, ctx);

  // Importar TaskExecutor dinámicamente para evitar circular deps
  const { TaskExecutor } = await import("@local/pi-subagents");

  const executor = new TaskExecutor({
    controller,
    onEvent: (event) => {
      // Reenviar eventos al bus de Lion
      bus.publish(LionEvents.subagentEvent, {
        runId,
        planSlug: plan.slug,
        planPath: plan.rootPath,
        taskId: task.id,
        subagentEvent: event,
      });
    },
  });

  const executionPlan: ExecutionPlan = {
    strategy: params.strategy,
    tasks: params.tasks.map((t, i) => ({
      id: `${runId}-task-${i}`,
      definition: t.definition,
      description: t.title,
      prompt: t.prompt,
      capabilities: t.capabilities,
    })),
    concurrency: params.concurrency,
    chainOptions: params.chainOptions,
  };

  bus.publish(LionEvents.tasksStart, {
    runId,
    planSlug: plan.slug,
    planPath: plan.rootPath,
    strategy: params.strategy,
    taskCount: params.tasks.length,
    concurrency: params.concurrency,
  });

  const result = await executor.execute(executionPlan);

  // Finalizar jobs y retener instancias
  for (let i = 0; i < result.results.length; i++) {
    const taskResult = result.results[i];
    const taskId = taskResult.taskId;

    finishLionSubagentJob(runtime, taskId, taskResult, taskResult.error);
    retainSubagent(runtime, { runId, role: "validator", taskId });

    bus.publish(LionEvents.tasksTaskEnd, {
      runId,
      planSlug: plan.slug,
      planPath: plan.rootPath,
      index: i,
      title: params.tasks[i].title,
      definition: params.tasks[i].definition,
      status: taskResult.status,
      summary: taskResult.summary,
    });
  }
  renderLionSubagentWidget(runtime, ctx);

  const lionResult: LionTasksResult = {
    runId,
    strategy: params.strategy,
    tasks: result.results.map((r, i) => ({
      taskId: r.taskId,
      title: params.tasks[i].title,
      definition: params.tasks[i].definition,
      status: r.status,
      summary: r.summary,
      duration: r.duration,
      turnCount: r.turnCount,
      error: r.error,
    })),
    completedCount: result.results.filter((r) => r.status === "completed").length,
    failedCount: result.results.filter((r) => r.status === "failed").length,
    completedAt: result.completedAt,
  };

  bus.publish(LionEvents.tasksComplete, {
    runId,
    planSlug: plan.slug,
    planPath: plan.rootPath,
    result: lionResult,
  });

  // Construir mensaje
  const lines = [
    `Task execution complete (${params.strategy}).`,
    `Tasks: ${lionResult.tasks.length}`,
    `Completed: ${lionResult.completedCount}`,
    `Failed: ${lionResult.failedCount}`,
    "",
    "Results:",
    ...lionResult.tasks.map((t) =>
      `  [${t.taskId}] ${t.title} (${t.definition}): ${t.status}${t.error ? ` — ${t.error}` : ""}`,
    ),
    "",
    "Use lion_prompt_subagent with the task_id to follow up.",
    "Use lion_release_subagent to release retained instances.",
  ];

  return {
    message: lines.join("\n"),
    run: runtime.core.activeRun,
    subagents: getLionSubagentHealth(runtime),
  };
}
```

## Validación

- [ ] `lion_tasks` ejecuta tareas en paralelo
- [ ] `lion_tasks` ejecuta tareas secuencialmente
- [ ] `lion_tasks` ejecuta tareas en cadena
- [ ] Las instancias se retienen para follow-up
- [ ] Los eventos se emiten correctamente
- [ ] La UI se actualiza en tiempo real

## Notas

- `TaskExecutor` se importa dinámicamente para evitar dependencias circulares
- El `role` para UI es `"validator"` como placeholder; considerar agregar un role genérico `"task"`
- Los `capabilities` por tarea permiten overridear los de la definición
