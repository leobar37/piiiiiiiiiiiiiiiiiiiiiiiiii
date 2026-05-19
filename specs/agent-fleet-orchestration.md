# Investigación: Orquestación de Flotas de Agentes Pi

> Estado: investigación activa  
> Alcance: arquitectura de procesos, protocolos de comunicación, patrones multi-agente  
> Fecha: 2026-05-17

---

## 1. Resumen Ejecutivo

El coding agent de Pi (`packages/coding-agent`) expone un modo RPC que permite controlarlo programáticamente mediante un protocolo JSONL sobre `stdin/stdout`. Este documento investiga cómo escalar ese mecanismo desde un único agente hasta una **flota orquestada de múltiples procesos agente**, analizando:

- Por qué el agente se diseñó como proceso independiente en lugar de librería.
- Cómo funciona el protocolo JSONL y la correlación request/response.
- Qué es un `Transport` y cómo desacopla eventos del agente de su consumidor.
- Cómo construir un `Orchestrator` que supervise, enrute y coordine N agentes.
- Patrones de ejecución: ensemble voting, map/reduce, A/B testing de modelos, revisión cruzada.

---

## 2. Contexto: El Agente en Modo RPC

### 2.1 Punto de entrada

El único API público programático del agente hoy es la CLI:

```bash
node dist/cli.js --mode rpc --provider openai --model gpt-4o
```

`main.ts` resuelve ~30 pasos de inicialización (config, auth, registro de extensiones, resolución de modelo) y luego delega a `runRpcMode(runtimeHost)`.

### 2.2 Protocolo JSONL

- **Entrada (`stdin`)**: líneas JSON con campo `type` y opcional `id` para correlación.
- **Salida (`stdout`)**: líneas JSON de dos tipos:
  - `type: "response"` → respuesta a un comando con `id` coincidente.
  - Eventos del agente (`text`, `tool_call`, `tool_result`, `agent_end`, etc.).
- **Framing**: delimitación estricta por `\n` (LF). No usa `readline` de Node porque este splittea también en U+2028/U+2029, rompiendo JSON válido.

```typescript
// jsonl.ts
export function serializeJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export function attachJsonlLineReader(
  stream: Readable,
  onLine: (line: string) => void
): () => void {
  // Buffer manual + indexOf('\n') — no readline
}
```

### 2.3 Correlación request/response

```typescript
const id = `req_${++this.requestId}`;
// Enviar:  { type: "bash", command: "ls", id: "req_1" }
// Recibir: { type: "response", command: "bash", id: "req_1", success: true, data: {...} }
```

El `RpcClient` mantiene un `Map<string, Promise>` para resolver la respuesta cuando llega el `id` correspondiente.

---

## 3. Investigación: Librería vs Proceso Independiente

### 3.1 Arquitectura actual

```
┌─────────────────┐         spawn()          ┌─────────────────┐
│   RpcClient     │ ───────────────────────► │  pi --mode rpc  │
│   (proceso A)   │   stdin  → JSON commands │  (proceso B)    │
│                 │   stdout ← JSON events   │                 │
│  Map<id, Promise│                        │  AgentSession   │
│  EventEmitter   │                        │  takeOverStdout │
└─────────────────┘                        │  process.exit   │
                                           └─────────────────┘
```

### 3.2 Por qué NO es una librería hoy

| Razón | Evidencia en código |
|-------|---------------------|
| **Acoplamiento a `process`** | `runRpcMode()` llama `takeOverStdout()`, intercepta `SIGTERM`, invoca `process.exit()` |
| **Inicialización monolítica** | `main.ts` maneja flags CLI, `.env`, extensión de filesystem, telemetry antes de crear el runtime |
| **Control de terminal** | El modo interactivo usa raw mode y blessed; si fuera librería pelearía con el host |
| **Ciclo de vida opaco** | `AgentSessionRuntime` destruye y recrea `AgentSession` internamente en `newSession()`, `fork()`, `switchSession()` |

### 3.3 Qué cambiaría si fuera librería

Se necesitaría:

1. **Desacoplar `process`** del runtime → inyectar streams en lugar de tocar `process.stdin/out`.
2. **Factory pública** → exponer `createAgentSessionServices()` y `createAgentSessionFromServices()` como API estable.
3. **Event bus desacoplado** → reemplazar el array interno de callbacks por un bus que pueda serializar o no.
4. **Shutdown graceful** → que `dispose()` libere recursos sin matar el proceso.

API ideal hipotética:

```typescript
const kernel = await AgentKernel.create({ cwd: "/proyecto", model: "gpt-4o" });
kernel.events.on((event) => { /* ... */ });
```

### 3.4 Trade-off decisivo

| Aspecto | Proceso separado (hoy) | Librería (ideal) |
|---------|------------------------|------------------|
| Aislamiento | Crash del agente no mata al host | Crash del agente mata todo |
| Memoria | Heap separado (~200-500MB por agente) | Heap compartido |
| Latencia | Doble serialización (JSONL + parse) | Cero overhead (objetos en memoria) |
| Multi-lenguaje | stdout funciona con Python, Rust, etc. | Solo Node.js |
| Escalabilidad | Fácil: más `spawn` | Requiere threading/worker_threads |
| Control del host | El host pierde stdout mientras corre | Control total |

**Conclusión**: Hoy el proceso separado es la única API pública. Para una flota multi-agente es inclusive deseable, porque cada agente aísla su memoria y puede morir sin afectar al orquestador.

---

## 4. El Patrón Transport

### 4.1 Motivación

El agente emite `AgentSessionEvent` (objetos en memoria). Una UI en el navegador no puede recibir objetos de memoria. Se necesita un adaptador que serialice y transmita.

### 4.2 Interfaz

```typescript
interface AgentTransport {
  emit(event: AgentSessionEvent): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onCommand?: (handler: (cmd: unknown) => void) => void;
}
```

### 4.3 Implementaciones

| Transporte | Uso | Serialización |
|------------|-----|---------------|
| **StdioTransport** | Proceso local hijo | JSONL sobre `stdout.pipe` |
| **WebSocketTransport** | Navegador o servicio remoto | JSON sobre WS frames |
| **SSETransport** | Dashboard simple, unidireccional | JSON sobre SSE stream |
| **TCPTransport** | Worker remoto en otra máquina | JSONL sobre `net.Socket` |

### 4.4 Serialización de eventos

Los eventos contienen objetos complejos (`Model<any>`, `AbortController`, referencias circulares). Se requiere un `replacer`:

```typescript
function serializeEvent(event: AgentSessionEvent): string {
  return JSON.stringify(event, (key, value) => {
    if (typeof value === "function") return undefined;
    if (value instanceof AbortController) return undefined;
    if (key === "_extensionRunner" || key === "agent") return undefined;
    return value;
  });
}
```

---

## 5. Arquitectura del Orquestador

### 5.1 Modelo Supervisor-Worker

El orquestador corre en un único proceso y spawnea N procesos `pi --mode rpc` como workers.

```
┌────────────────────────────────────────────────────────────┐
│                  PiAgentOrchestrator                       │
│                                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Agent #1    │  │ Agent #2    │  │ Agent #N    │        │
│  │ gpt-4o      │  │ claude-son  │  │ o1-mini     │        │
│  │ STATE: idle │  │ STATE: busy │  │ STATE: idle │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │
│    spawn()          spawn()          spawn()              │
│    pi --rpc         pi --rpc         pi --rpc              │
│    RpcClient        RpcClient        RpcClient             │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Estado del worker

```typescript
interface AgentHandle {
  id: string;
  client: RpcClient;
  config: AgentConfig;
  state: "starting" | "ready" | "idle" | "busy" | "dead" | "error";
  lastError?: string;
  stats?: RpcSessionState;
  events: AgentEvent[]; // Buffer de la sesión actual
}
```

### 5.3 Estrategias de routing

| Método | Lógica | Uso |
|--------|--------|-----|
| `nextAvailable()` | Round-robin entre `idle` | Balanceo simple |
| `randomAvailable()` | Aleatorio entre `idle` | Distribución uniforme |
| `leastLoaded()` | Menor `messageCount` | Ahorro de tokens/contexto |
| `byTag(tag)` | Filtra por `config.tags` | Routing por capacidad (ej: "backend", "review") |

### 5.4 Ciclo de vida

```
spawn(config)
  → new RpcClient(config)
  → client.start() → spawn("node", ["dist/cli.js", "--mode", "rpc", ...])
  → client.getState() → state = idle | busy
  → onEvent((event) => { update state; emit("event", {agentId, event}) })

kill(agentId)
  → client.stop() → SIGTERM → (fallback SIGKILL a los 5s)
  → delete from Map

dispose()
  → Promise.all(agents.map(kill))
```

---

## 6. Patrones de Ejecución Multi-Agente

### 6.1 Ensemble Voting (mismo prompt, distintos modelos)

Lanzar el mismo prompt a N agentes en paralelo y comparar resultados.

```typescript
const results = await fleet.parallelPrompt(
  "Implementa una función de rate limiting sliding window",
  { timeout: 120000 }
);
// results: Array<{ agentId, events, text }>
```

Aplicación: detectar alucinaciones por consenso, elegir la mejor implementación.

### 6.2 A/B Testing de Modelos

Dos agentes con el mismo prompt y modelo distinto. El orquestador recolecta métricas:

- Tiempo hasta `agent_end`
- Cantidad de `tool_call` (menos es mejor si el resultado es igual)
- Calidad del output (evaluado por un tercer agente o heurística)

### 6.3 Map/Reduce de archivos

Distribuir N archivos entre K agentes disponibles.

```typescript
const results = await fleet.map(
  files,
  async (file, agent) => {
    const content = fs.readFileSync(file, "utf-8");
    await agent.client.prompt(`Revisa ${file}:\n${content}`);
    await agent.client.waitForIdle();
    return extractText(agent.events);
  },
  { concurrency: 5 }
);
// results: Map<agentId, Array<{item, result}>>
```

### 6.4 Pipeline secuencial (Arquitecto → Implementador → Reviewer)

```
Agente_A (o1-preview)  →  Agente_B (gpt-4o)  →  Agente_C (claude-sonnet)
     "Diseña API"     →    "Implementa"     →    "Revisa bugs"
```

Cada fase consume el output textual de la anterior.

### 6.5 Revisión cruzada

Agente A revisa el código de B, y B revisa el código de A. El orquestador extrae el consenso (bugs que ambos detectaron).

### 6.6 Steering en caliente

El orquestador escucha eventos y emite `steer()` si detecta desvío:

```typescript
fleet.on("event", ({ agentId, event }) => {
  if (event.type === "text" && event.content.includes("Python")) {
    fleet.steer(agentId, "NO uses Python. Proyecto TypeScript.");
  }
});
```

### 6.7 Broadcast de control

- `broadcastPrompt()` — mismo prompt a todos (ej: "Actualizá tus dependencias").
- `broadcastAbort()` — cancelar todos los agentes simultáneamente.
- `broadcastBash()` — setup común (ej: `git pull`, `npm install`).

---

## 7. Heartbeat y Supervisión

### 7.1 Detección de muerte

```typescript
child.on("exit", (code, signal) => {
  handle.state = "dead";
  emit("death", { agentId, code, signal });
  // Opcional: re-spawn con backoff
});
```

### 7.2 Heartbeat por IPC

Si el worker se spawnea con `stdio: ["pipe", "pipe", "pipe", "ipc"]`:

```typescript
// Orquestador → Worker
child.send("ping");

// Worker → Orquestador
process.on("message", (msg) => {
  if (msg === "ping") {
    process.send!({ type: "pong", pid: process.pid, memory: process.memoryUsage() });
  }
});
```

El IPC de Node usa `v8.serialize()` (más rápido que JSON) pero no funciona cross-lenguaje. Para workers no-Node se usa TCP/HTTP.

### 7.3 Recuperación

| Escenario | Acción |
|-----------|--------|
| Muerte inesperada (exit !== 0) | Re-spawn con exponential backoff |
| Timeout en heartbeat | Marcar como `dead`, redistribuir tareas |
| Memoria excesiva (`rss > 1GB`) | Enviar `SIGTERM`, re-spawn |
| Stuck (busy > timeout) | `kill(agentId)` + re-asignar tarea |

---

## 8. Código de Referencia

### 8.1 Worker abstracto (base para cualquier subproceso JSONL)

Ver: `packages/coding-agent/src/modes/rpc/jsonl.ts`  
Ver: `packages/coding-agent/src/modes/rpc/rpc-types.ts`

### 8.2 RpcClient (cliente oficial)

Ver: `packages/coding-agent/src/modes/rpc/rpc-client.ts`

Métodos clave:
- `start()` → `spawn("node", [cliPath, "--mode", "rpc", ...])`
- `send(command)` → serializa a JSONL por `stdin`
- `handleLine()` → parsea stdout, resuelve promises por `id`, re-emite eventos
- `onEvent(listener)` → patrón pub/sub para eventos de streaming
- `waitForIdle()` → resuelve cuando llega `agent_end`
- `stop()` → `SIGTERM`, fallback a `SIGKILL`

### 8.3 Orquestador (implementación propuesta)

Ver sección 5. La clase `PiAgentOrchestrator` encapsula:

- `spawn(config)` — levanta un agente, conecta eventos, sincroniza estado.
- `kill(id)` / `dispose()` — teardown ordenado.
- `nextAvailable()` / `leastLoaded()` / `byTag()` — routing.
- `parallelPrompt()` — ensemble voting.
- `map(items, mapper, concurrency)` — fan-out de trabajo.
- `broadcastPrompt()` / `broadcastAbort()` — control masivo.
- `waitForIdle(id)` / `waitForAllIdle()` — sincronización.

---

## 9. Escalabilidad Horizontal

### 9.1 Misma máquina

`PiAgentOrchestrator` spawnea procesos locales. Límite: CPU, memoria, file descriptors del OS.

### 9.2 Múltiples máquinas

Cuando stdio no alcanza, el protocolo JSONL se transporta sobre TCP:

```
┌─────────────┐     TCP Socket       ┌─────────────┐
│ Orquestador │ ◄──────────────────► │   Worker    │
│   (Node)    │   JSONL framing      │  (remoto)   │
└─────────────┘                      └─────────────┘
```

El worker remoto puede ser el mismo `pi --mode rpc` envuelto en un proxy TCP, o un servicio HTTP que recibe comandos y devuelve SSE.

### 9.3 Persistencia de sesiones

Si el orquestador muere, los procesos hijos quedan huérfanos. Estrategias:

1. **Graceful shutdown**: `dispose()` mata a todos antes de salir.
2. **Adopción**: al reiniciar, el nuevo orquestador encuentra PIDs vivos vía `ps` y se re-adopta (complejo, no recomendado).
3. **Session files**: el agente persiste sesiones en disco (`sessionManager`). Al re-spawn, se puede `switchSession()` para recuperar contexto.

---

## 10. Conclusiones

1. **El agente Pi es un proceso, no una librería**. Esto es intencional: aislamiento, reutilización de la CLI, y compatibilidad con cualquier lenguaje que hable JSONL.

2. **El protocolo JSONL sobre stdio es suficiente para orquestación local**. No requiere HTTP ni WebSocket. La correlación por `id` permite requests/response async sobre un stream unidireccional.

3. **Un orquestador es un supervisor de procesos + un router de eventos**. Su valor no está en el protocolo, sino en las estrategias de routing (`leastLoaded`, `byTag`) y los patrones de ejecución (`parallelPrompt`, `map`).

4. **La UI observa, no controla directamente**. El orquestador recibe eventos de los agentes y los retransmite por WebSocket/SSE. La UI es un consumidor pasivo del event bus del orquestador.

5. **Para producción**, faltan: heartbeat con re-spawn, límites de memoria por worker, cola de tareas pendientes, y persistencia del estado del orquestador.

---

## 11. Próximos Pasos Propuestos

- [ ] Implementar `PiAgentOrchestrator` como paquete interno (`packages/coding-agent/src/orchestrator/`).
- [ ] Agregar heartbeat con re-spawn automático y backoff exponencial.
- [ ] Diseñar `Transport` abstraído: `StdioTransport`, `WebSocketTransport`, `SSETransport`.
- [ ] Construir dashboard web que se suscriba al event bus del orquestador.
- [ ] Evaluar si se expone `AgentSessionRuntime` como librería para reducir overhead de procesos.

---

## Referencias internas

- `packages/coding-agent/src/modes/rpc/jsonl.ts` — Serialización JSONL
- `packages/coding-agent/src/modes/rpc/rpc-types.ts` — Tipos del protocolo
- `packages/coding-agent/src/modes/rpc/rpc-client.ts` — Cliente RPC
- `packages/coding-agent/src/modes/rpc/rpc-mode.ts` — Servidor RPC (lado agente)
- `packages/coding-agent/src/core/agent-session-runtime.ts` — Runtime de sesión
- `packages/coding-agent/src/core/agent-session.ts` — Sesión y eventos
- `packages/coding-agent/src/main.ts` — Entry point y modo RPC
