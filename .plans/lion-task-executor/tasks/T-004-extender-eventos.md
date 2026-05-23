# T-004: Extender Eventos de Progreso

## Objetivo
Agregar eventos en tiempo real para observabilidad durante la ejecución.

## Cambios en `packages/subagents/src/types.ts`

### Extender SubAgentEventMap

```typescript
export interface SubAgentEventMap {
  // ... eventos existentes ...

  "tool.start": {
    type: "tool.start";
    instanceId: string;
    taskId: string;
    toolName: string;
    toolCallId: string;
    timestamp: number;
  };

  "tool.end": {
    type: "tool.end";
    instanceId: string;
    taskId: string;
    toolName: string;
    toolCallId: string;
    isError: boolean;
    timestamp: number;
  };

  "instance.created": {
    type: "instance.created";
    instanceId: string;
    taskId: string;
    definitionName: string;
    timestamp: number;
  };

  "instance.state": {
    type: "instance.state";
    instanceId: string;
    taskId: string;
    state: SubAgentInstanceState;
    timestamp: number;
  };
}
```

## Cambios en `packages/subagents/src/instance.ts`

### Emitir evento `instance.created`

En el constructor:

```typescript
constructor(options: CreateSubAgentInstanceOptions) {
  // ... código existente ...

  const event: SubAgentEvent = {
    type: "instance.created",
    instanceId: this.instanceId,
    taskId: this.taskId,
    definitionName: this.definitionName,
    timestamp: Date.now(),
  };
  this.logEvent(event);
  this.eventBus.emit(event);
}
```

### Emitir evento `instance.state` periódicamente

Agregar un método para emitir estado:

```typescript
private emitState(): void {
  const event: SubAgentEvent = {
    type: "instance.state",
    instanceId: this.instanceId,
    taskId: this.taskId,
    state: this.getState(),
    timestamp: Date.now(),
  };
  this.logEvent(event);
  this.eventBus.emit(event);
}
```

Llamar `emitState()` en:
- `transition()` — cuando cambia el estado
- `handleSessionEvent()` — después de cada evento de sesión

### Separar `tool.execute` en `tool.start` y `tool.end`

```typescript
case "tool_execution_start": {
  this.currentTool = event.toolName;
  const toolEvent: SubAgentEvent = {
    type: "tool.start",
    instanceId: this.instanceId,
    taskId: this.taskId,
    toolName: event.toolName,
    toolCallId: event.toolCallId,
    timestamp: now,
  };
  this.logEvent(toolEvent);
  this.eventBus.emit(toolEvent);
  break;
}

case "tool_execution_end": {
  this.currentTool = null;
  const toolEvent: SubAgentEvent = {
    type: "tool.end",
    instanceId: this.instanceId,
    taskId: this.taskId,
    toolName: event.toolName,
    toolCallId: event.toolCallId,
    isError: event.isError,
    timestamp: now,
  };
  this.logEvent(toolEvent);
  this.eventBus.emit(toolEvent);
  break;
}
```

## Cambios en `packages/subagents/src/task-executor.ts`

### Reenviar eventos al orquestador

```typescript
private async executeTask(task: DelegationTask): Promise<DelegationResult> {
  const instance = this.controller.createInstance(task);

  // Reenviar todos los eventos de esta instancia
  const unsubscribe = this.controller.getEventBus().on("*", (event: SubAgentEvent) => {
    if ("instanceId" in event && event.instanceId === instance.instanceId) {
      this.onEvent?.(event);
    }
  });

  try {
    const result = await instance.start();
    return result;
  } finally {
    unsubscribe();
  }
}
```

## Validación

- [ ] Eventos `instance.created` se emiten al crear instancia
- [ ] Eventos `instance.state` se emiten en cambios de estado
- [ ] Eventos `tool.start`/`tool.end` se emiten al ejecutar tools
- [ ] El orquestador recibe eventos en tiempo real
- [ ] Los eventos incluyen `instanceId` y `taskId`

## Notas

- Los eventos son best-effort; si el orquestador no está escuchando, se pierden
- `instance.state` incluye el estado completo para que el orquestador tenga toda la metadata
- Considerar throttling para `instance.state` si se emite muy frecuentemente
