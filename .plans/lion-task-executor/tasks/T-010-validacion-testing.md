# T-010: Validación y Testing

## Objetivo
Verificar que toda la implementación funciona correctamente.

## Tests para packages/subagents

### Test: TaskExecutor sequential

```typescript
import { describe, expect, it } from "vitest";
import { TaskExecutor } from "../src/task-executor.js";
import { SubAgentController } from "../src/controller.js";

describe("TaskExecutor", () => {
  it("executes tasks sequentially", async () => {
    const controller = new SubAgentController({
      definitions: [/* mock definitions */],
      cwd: "/tmp",
    });

    const executor = new TaskExecutor({ controller });

    const plan = {
      strategy: "sequential" as const,
      tasks: [
        { id: "task-1", definition: "analyzer", prompt: "Analyze A" },
        { id: "task-2", definition: "analyzer", prompt: "Analyze B" },
      ],
    };

    const result = await executor.execute(plan);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe("completed");
    expect(result.results[1].status).toBe("completed");
  });
});
```

### Test: TaskExecutor parallel

```typescript
it("executes tasks in parallel with concurrency limit", async () => {
  const controller = new SubAgentController({
    definitions: [/* mock definitions */],
    cwd: "/tmp",
  });

  const executor = new TaskExecutor({ controller });

  const plan = {
    strategy: "parallel" as const,
    tasks: [
      { id: "task-1", definition: "analyzer", prompt: "Analyze A" },
      { id: "task-2", definition: "analyzer", prompt: "Analyze B" },
      { id: "task-3", definition: "analyzer", prompt: "Analyze C" },
    ],
    concurrency: 2,
  };

  const result = await executor.execute(plan);

  expect(result.results).toHaveLength(3);
  expect(result.results.every((r) => r.status === "completed")).toBe(true);
});
```

### Test: TaskExecutor chain

```typescript
it("executes chain passing output to next task", async () => {
  const controller = new SubAgentController({
    definitions: [/* mock definitions */],
    cwd: "/tmp",
  });

  const executor = new TaskExecutor({ controller });

  const plan = {
    strategy: "chain" as const,
    tasks: [
      { id: "task-1", definition: "analyzer", prompt: "Analyze" },
      { id: "task-2", definition: "reviewer", prompt: "Review" },
    ],
    chainOptions: {
      passOutputToNext: true,
      outputMode: "append" as const,
    },
  };

  const result = await executor.execute(plan);

  expect(result.results).toHaveLength(2);
  expect(result.results[0].status).toBe("completed");
  expect(result.results[1].status).toBe("completed");
  // Verificar que el output se pasó
});
```

### Test: TaskExecutor events

```typescript
it("emits events during execution", async () => {
  const controller = new SubAgentController({
    definitions: [/* mock definitions */],
    cwd: "/tmp",
  });

  const events: SubAgentEvent[] = [];
  const executor = new TaskExecutor({
    controller,
    onEvent: (event) => events.push(event),
  });

  const plan = {
    strategy: "sequential" as const,
    tasks: [{ id: "task-1", definition: "analyzer", prompt: "Analyze" }],
  };

  await executor.execute(plan);

  expect(events.some((e) => e.type === "task.start")).toBe(true);
  expect(events.some((e) => e.type === "task.end")).toBe(true);
});
```

## Validación Manual para Lion

### Escenario 1: Planificación con análisis paralelo

```
/lion-activate my-plan
lion_tasks({
  strategy: "parallel",
  tasks: [
    { definition: "analyzer", title: "Riesgos", prompt: "Analiza riesgos..." },
    { definition: "researcher", title: "Dependencias", prompt: "Investiga..." }
  ]
})
```

**Verificar:**
- [ ] Ambos subagentes corren simultáneamente
- [ ] El widget muestra ambos en "running"
- [ ] Los resultados se agregan al final
- [ ] Las instancias se retienen

### Escenario 2: Build con chain

```
lion_tasks({
  strategy: "chain",
  tasks: [
    { definition: "executor", title: "Implementar", prompt: "Implementa..." },
    { definition: "reviewer", title: "Revisar", prompt: "Revisa..." }
  ],
  chainOptions: { passOutputToNext: true }
})
```

**Verificar:**
- [ ] El executor corre primero
- [ ] El reviewer recibe el output del executor
- [ ] El chain se detiene si el executor falla

### Escenario 3: Observabilidad

```
lion_task_list()
lion_task_status({ task_id: "..." })
lion_task_health()
```

**Verificar:**
- [ ] `lion_task_list` muestra todas las tareas
- [ ] `lion_task_status` muestra metadata detallada
- [ ] `lion_task_health` detecta tareas stuck

## Checklist Final

- [ ] `bun run check` pasa sin errores
- [ ] Tests de `TaskExecutor` pasan
- [ ] Flujo de planificación funciona
- [ ] Flujo de build funciona
- [ ] Observabilidad funciona
- [ ] UI se actualiza en tiempo real
- [ ] No hay regressions en funcionalidad existente
