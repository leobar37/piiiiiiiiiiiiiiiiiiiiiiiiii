# T-006: Implementar Tools de Observabilidad

## Objetivo
Crear tools para que el orquestador inspeccione subagentes en ejecución.

## Cambios en `packages/extensions/src/extensions/lion/tools.ts`

### lion_task_status

```typescript
const TaskStatusParams = Type.Object({
  task_id: Type.String({ description: "Task ID of the subagent to inspect" }),
});

runtime.pi.registerTool({
  name: "lion_task_status",
  label: "Lion Task Status",
  description: "Get detailed status of a specific subagent task including state, duration, turns, tools, and current activity.",
  promptSnippet: "Check the status of a running or retained subagent",
  parameters: TaskStatusParams,
  async execute(_toolCallId, params) {
    const response = getTaskStatus(runtime, params.task_id);
    return toToolResult(response);
  },
});

function getTaskStatus(runtime: LionRuntime, taskId: string): LionToolResponse {
  const job = runtime.subagentJobs.get(taskId);
  const ui = runtime.subagentUi.get(taskId);
  const retained = runtime.retainedInstances.get(taskId);

  if (!job && !ui && !retained) {
    throw new Error(`Task ${taskId} not found.`);
  }

  const controller = retained ? runtime.controllers.get(retained.runId) : null;
  const instance = controller?.getInstance(taskId);
  const state = instance?.getState();

  const now = Date.now();
  const elapsedMs = state?.startTime ? now - state.startTime : 0;

  return {
    message: `Task status for ${taskId}`,
    run: runtime.core.activeRun,
    subagents: [{
      taskId,
      role: retained?.role ?? "unknown",
      title: ui?.title ?? job?.title ?? "unknown",
      status: ui?.status ?? job?.status ?? "unknown",
      state: state?.state ?? "unknown",
      elapsedMs,
      turnCount: state?.turnCount ?? ui?.turnCount ?? 0,
      toolCount: state?.toolCount ?? ui?.toolCount ?? 0,
      currentTool: state?.currentTool ?? ui?.currentTool ?? null,
      summary: ui?.summary ?? job?.result?.summary ?? null,
      error: job?.error ?? state?.error ?? null,
    }],
  };
}
```

### lion_task_list

```typescript
runtime.pi.registerTool({
  name: "lion_task_list",
  label: "Lion Task List",
  description: "List all active and retained subagent tasks with their status.",
  promptSnippet: "List all subagent tasks",
  parameters: Type.Object({}),
  async execute() {
    const response = listTasks(runtime);
    return toToolResult(response);
  },
});

function listTasks(runtime: LionRuntime): LionToolResponse {
  const jobs = Array.from(runtime.subagentJobs.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((job) => ({
      taskId: job.taskId,
      role: job.role,
      title: job.title,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    }));

  return {
    message: jobs.length ? `Found ${jobs.length} tasks.` : "No tasks found.",
    run: runtime.core.activeRun,
    subagents: jobs,
  };
}
```

### lion_task_health

```typescript
const TaskHealthParams = Type.Object({
  task_id: Type.Optional(Type.String({ description: "Optional task ID to inspect. If omitted, checks all tasks." })),
});

runtime.pi.registerTool({
  name: "lion_task_health",
  label: "Lion Task Health",
  description: "Check health of subagent tasks. Reports running, stuck, or failed tasks.",
  promptSnippet: "Check subagent health",
  parameters: TaskHealthParams,
  async execute(_toolCallId, params) {
    const response = checkTaskHealth(runtime, params.task_id);
    return toToolResult(response);
  },
});

function checkTaskHealth(runtime: LionRuntime, taskId?: string): LionToolResponse {
  const jobs = getLionSubagentHealth(runtime, taskId);
  const now = Date.now();

  const stuckThreshold = 5 * 60 * 1000; // 5 minutes without activity

  const health = jobs.map((job) => {
    const lastActivity = job.lastEvents.length > 0
      ? Math.max(...job.lastEvents.map((e) => e.timestamp))
      : job.startedAt;
    const inactiveMs = now - lastActivity;
    const isStuck = job.status === "running" && inactiveMs > stuckThreshold;

    return {
      taskId: job.taskId,
      status: job.status,
      isStuck,
      inactiveMs,
      lastEvent: job.lastEvents[job.lastEvents.length - 1]?.type ?? null,
      error: job.error,
    };
  });

  const stuck = health.filter((h) => h.isStuck);
  const failed = health.filter((h) => h.status === "failed");

  return {
    message: [
      `Health check: ${health.length} tasks`,
      stuck.length ? `Stuck: ${stuck.map((s) => s.taskId).join(", ")}` : "No stuck tasks",
      failed.length ? `Failed: ${failed.map((f) => f.taskId).join(", ")}` : "No failed tasks",
    ].join("\n"),
    run: runtime.core.activeRun,
    subagents: health,
  };
}
```

## Validación

- [ ] `lion_task_status` devuelve estado detallado
- [ ] `lion_task_list` lista todas las tareas
- [ ] `lion_task_health` detecta tareas stuck
- [ ] Las tools funcionan con tareas en ejecución y retenidas

## Notas

- `lion_task_status` accede al estado real de la instancia vía `controller.getInstance()`
- `lion_task_health` usa un threshold de 5 minutos para detectar tareas stuck
- Las tools son read-only (no mutan estado)
