# T-003: Implementar Tool `lion_plan_parallel`

## Objetivo
Registrar la nueva tool `lion_plan_parallel` en el sistema de tools de Lion con validación de modo planning.

## Archivos a Modificar

### 1. `packages/extensions/src/extensions/lion/tools.ts`

Agregar el schema de parámetros:

```typescript
const PlanParallelParams = Type.Object({
  tasks: Type.Array(
    Type.Object({
      agent: Type.Union([
        Type.Literal("analyzer"),
        Type.Literal("researcher"),
        Type.Literal("validator"),
      ], {
        description: "Subagent definition to use for this parallel task.",
      }),
      title: Type.String({ description: "Short title identifying this parallel task." }),
      prompt: Type.String({ description: "Full prompt/instructions for the subagent." }),
    }),
    { description: "Array of parallel tasks to execute." },
  ),
  concurrency: Type.Optional(
    Type.Number({
      description: "Maximum number of subagents to run simultaneously. Default: 3.",
      minimum: 1,
      maximum: 10,
    }),
  ),
});
```

Agregar el registro de la tool:

```typescript
runtime.pi.registerTool({
  name: "lion_plan_parallel",
  label: "Lion Plan Parallel",
  description:
    "Launch multiple planning subagents in parallel to analyze, research, or validate different aspects of the active plan. Only available in planning mode. Each subagent is read-only (cannot edit files).",
  promptSnippet: "Launch parallel planning subagents to analyze the plan from multiple angles",
  parameters: PlanParallelParams,
  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const response = await startParallelPlanning(runtime, ctx, params.tasks, params.concurrency ?? 3);
    return toToolResult(response);
  },
});
```

Implementar la función `startParallelPlanning`:

```typescript
export async function startParallelPlanning(
  runtime: LionRuntime,
  ctx: ExtensionContext,
  tasks: Array<{ agent: "analyzer" | "researcher" | "validator"; title: string; prompt: string }>,
  concurrency: number,
): Promise<LionToolResponse> {
  // Validar modo planning
  if (runtime.state.mode !== "planning") {
    throw new Error(
      `lion_plan_parallel is only available in planning mode. Current mode: ${runtime.state.mode}. Use /lion-build to enter build mode for sequential task execution.`,
    );
  }

  const activePlanPath = runtime.state.activePlanPath;
  if (!activePlanPath) {
    throw new Error("lion_plan_parallel requires an active plan. Run lion_activate_plan first.");
  }

  assertNoRunningSubagents(runtime);
  rememberLionUiContext(runtime, ctx);

  const runId = createRunId();
  const bus = runtime.events;
  const plan = loadLionPlan(activePlanPath);

  // Crear un task ficticio para el controller
  const task: LionTask = {
    id: `parallel-${runId}`,
    title: `Parallel planning analysis (${tasks.length} tasks)`,
    file: "task-index.md",
    status: "pending",
    dependencies: [],
    requirements: [],
  };

  const controller = createController(runtime, ctx, runId, plan, task);

  // Iniciar UI para cada subagente
  for (let i = 0; i < tasks.length; i++) {
    const taskId = `${runId}-parallel-${i}`;
    startLionSubagentJob(runtime, {
      runId,
      taskId,
      role: "validator", // Usamos validator como role genérico para planificación
      title: tasks[i].title,
    });
    startLionSubagentUi(runtime, {
      runId,
      taskId,
      role: "validator",
      title: tasks[i].title,
    });
  }
  renderLionSubagentWidget(runtime, ctx);

  // Ejecutar en paralelo
  const { runParallelDelegation } = await import("../subagents/parallel.js");
  const parallelResult = await runParallelDelegation({
    controller,
    bus,
    runId,
    planSlug: plan.slug,
    planPath: plan.rootPath,
    tasks,
    concurrency,
  });

  // Finalizar jobs y retener instancias
  for (let i = 0; i < parallelResult.tasks.length; i++) {
    const taskResult = parallelResult.tasks[i];
    const taskId = taskResult.taskId;

    // Crear un DelegationResult sintético para finishLionSubagentJob
    const syntheticResult: DelegationResult = {
      taskId,
      status: taskResult.status,
      summary: taskResult.summary,
      finalState: {
        instanceId: taskId,
        status: taskResult.status,
        summary: taskResult.summary,
        turnCount: 0,
        toolCount: 0,
      },
    };

    finishLionSubagentJob(runtime, taskId, syntheticResult, taskResult.error);
    retainSubagent(runtime, { runId, role: "validator", taskId });
  }
  renderLionSubagentWidget(runtime, ctx);

  // Construir mensaje de resultado
  const lines = [
    `Parallel planning complete for ${plan.slug}.`,
    `Tasks: ${parallelResult.tasks.length}`,
    `Completed: ${parallelResult.completedCount}`,
    `Failed: ${parallelResult.failedCount}`,
    "",
    "Results:",
    ...parallelResult.tasks.map((t) =>
      `  [${t.index + 1}] ${t.title} (${t.agent}): ${t.status}${t.error ? ` — ${t.error}` : ""}`,
    ),
    "",
    "Use lion_prompt_subagent with the task_id to follow up on any result.",
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

- [ ] La tool rechaza ejecución si no está en modo `planning`
- [ ] La tool rechaza ejecución si no hay plan activo
- [ ] Los subagentes se ejecutan en paralelo con el límite de concurrencia
- [ ] Los resultados se agregan correctamente
- [ ] Las instancias se retienen para follow-up

## Notas

- El `role` usado para UI/jobs es `"validator"` porque es el role existente más cercano a "read-only analysis". Considerar agregar un role `"planner"` si se quiere distinguir visualmente.
- El `createController` requiere un `LionTask`; usamos uno sintético para la ejecución paralela.
