import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ThreadPromptImage } from "../../src/api/session-control.js";
import { SubAgentEventBus } from "../../src/event-bus.js";
import { SubAgentRunStore } from "../../src/run-store.js";
import { HttpServerTransport } from "../../src/transport/http-server.js";
import type { DashboardSessionSource } from "../../src/transport/types.js";
import type { SubAgentEvent, SubAgentInstanceState } from "../../src/types.js";
import { createMockBunServe } from "./bun-mock.js";

// ---------------------------------------------------------------------------
// Minimal mock controller that satisfies what HttpServerTransport needs
// ---------------------------------------------------------------------------
function createMockController(cwd: string) {
	const bus = new SubAgentEventBus();
	return {
		getCwd: () => cwd,
		getEventBus: () => bus,
		getInstanceStates: () => [] as SubAgentInstanceState[],
		getInstances: () => [],
		getInstance: () => undefined,
		getInstanceById: () => undefined,
		getModelRegistry: () => undefined,
		getSettingsManager: () => undefined,
		getAuthStorage: () => undefined,
	};
}

function createMockMainSession(): DashboardSessionSource {
	return {
		getThread: () => null,
		getMessages: () => null,
		getEvents: () => [],
		subscribe: () => {
			return () => {};
		},
	};
}

function createControllableMainSession(
	calls: Array<{ message: string; mode: "prompt" | "follow_up" | "steer"; images?: ThreadPromptImage[] }>,
	modelCalls: Array<{ provider: string; modelId: string }> = [],
	options: { acceptModelSelection?: boolean; cwd?: string } = {},
): DashboardSessionSource {
	let modelProvider = "kimi-coding";
	let modelId = "kimi-for-coding";
	return {
		getThread: () => ({
			instanceId: "main:session-1",
			taskId: "main",
			definitionName: "main-agent",
			cwd: options.cwd ?? "/tmp/main-session",
			kind: "main",
			state: "paused",
			startTime: null,
			endTime: null,
			turnCount: 0,
			lastActivityAt: 100,
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 0,
			sessionId: "session-1",
			modelProvider,
			modelId,
		}),
		getMessages: () => [],
		getEvents: () => [],
		sendMessage: async (_threadId, message, mode, images) => {
			calls.push({ message, mode, images });
		},
		getCommands: () => [{ name: "lion-build", description: "Activate Lion build mode", source: "extension" }],
		getModels: () => [
			{
				provider: "kimi-coding",
				id: "kimi-for-coding",
				name: "Kimi For Coding",
				api: "anthropic-messages",
				reasoning: true,
			},
			{
				provider: "openai-codex",
				id: "gpt-5.5",
				name: "GPT 5.5 Codex",
				api: "openai-codex-responses",
				reasoning: true,
			},
		],
		setModel: async (_threadId, provider, nextModelId) => {
			modelCalls.push({ provider, modelId: nextModelId });
			if (options.acceptModelSelection === false) return false;
			modelProvider = provider;
			modelId = nextModelId;
			return true;
		},
		subscribe: () => {
			return () => {};
		},
	};
}

type MockController = ReturnType<typeof createMockController>;

async function callRpc(port: number, procedure: string, input?: unknown): Promise<Response> {
	const body = input === undefined ? {} : { json: input };
	return fetch(`http://127.0.0.1:${port}/rpc${procedure}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("HttpServerTransport", () => {
	let tmpDir: string;
	let controller: MockController;
	let transport: HttpServerTransport;
	let originalBun: typeof Bun | undefined;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "http-server-test-"));
		controller = createMockController(tmpDir);
		const mock = createMockBunServe();
		originalBun = globalThis.Bun;
		Object.defineProperty(globalThis, "Bun", {
			value: { serve: mock.serve },
			configurable: true,
			writable: true,
		});
	});

	afterEach(async () => {
		if (transport) {
			try {
				await transport.stop();
			} catch {
				/* already stopped */
			}
		}
		await rm(tmpDir, { recursive: true, force: true });
		if (originalBun) {
			Object.defineProperty(globalThis, "Bun", {
				value: originalBun,
				configurable: true,
				writable: true,
			});
		} else {
			delete (globalThis as { Bun?: typeof Bun }).Bun;
		}
	});

	/**
	 * Node's server.listen() may need a few ticks before server.address()
	 * returns a real port. Poll briefly to avoid flakiness.
	 */
	async function waitForServer(): Promise<void> {
		for (let i = 0; i < 50; i++) {
			await new Promise<void>((resolve) => setImmediate(resolve));
			if (transport?.port > 0) return;
		}
	}

	// ---- tests -----------------------------------------------------------

	it("starts on port 0 (random port)", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();
		expect(transport.port).toBeGreaterThan(0);
	});

	it("serves ORPC /rpc/threads.list endpoint", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			mainSession: createMockMainSession(),
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/threads/list");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.json)).toBe(true);
	});

	it("creates standalone threads in the requested cwd", async () => {
		const selectedCwd = join(tmpDir, "selected-project");
		mkdirSync(selectedCwd, { recursive: true });
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			mainSession: createMockMainSession(),
		});
		await transport.start();
		await waitForServer();

		const createRes = await callRpc(transport.port, "/threads/create", {
			name: "Selected project",
			cwd: selectedCwd,
		});
		expect(createRes.status).toBe(200);
		const createBody = (await createRes.json()) as { json: { threadId: string; cwd: string } };
		expect(createBody.json.cwd).toBe(selectedCwd);

		const getRes = await callRpc(transport.port, "/threads/get", { threadId: createBody.json.threadId });
		expect(getRes.status).toBe(200);
		const getBody = (await getRes.json()) as { json: Record<string, unknown> };
		expect(getBody.json).toMatchObject({
			instanceId: createBody.json.threadId,
			definitionName: "standalone",
			cwd: selectedCwd,
			kind: "main",
		});
	});

	it("serves dashboard prompt and commands for the main thread", async () => {
		const calls: Array<{ message: string; mode: "prompt" | "follow_up" | "steer"; images?: ThreadPromptImage[] }> =
			[];
		const modelCalls: Array<{ provider: string; modelId: string }> = [];
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			mainSession: createControllableMainSession(calls, modelCalls),
		});
		await transport.start();
		await waitForServer();

		const commandsRes = await callRpc(transport.port, "/threads/commands", { threadId: "main:session-1" });
		expect(commandsRes.status).toBe(200);
		const commandsBody = (await commandsRes.json()) as { json: Array<Record<string, unknown>> };
		expect(commandsBody.json).toEqual([
			{ name: "lion-build", description: "Activate Lion build mode", source: "extension" },
		]);

		const promptRes = await callRpc(transport.port, "/threads/prompt", {
			threadId: "main:session-1",
			message: "Continue the run",
			mode: "follow_up",
		});
		expect(promptRes.status).toBe(200);
		const promptBody = (await promptRes.json()) as { json: Record<string, unknown> };
		expect(promptBody.json).toMatchObject({
			threadId: "main:session-1",
			mode: "follow_up",
			status: "sent",
		});
		expect(calls).toEqual([{ message: "Continue the run", mode: "follow_up" }]);

		const imagePromptRes = await callRpc(transport.port, "/threads/prompt", {
			threadId: "main:session-1",
			message: "",
			mode: "prompt",
			images: [{ type: "image", data: "abc", mimeType: "image/png", name: "clip.png" }],
		});
		expect(imagePromptRes.status).toBe(200);
		expect(calls[1]).toEqual({
			message: "",
			mode: "prompt",
			images: [{ type: "image", data: "abc", mimeType: "image/png", name: "clip.png" }],
		});

		const modelsRes = await callRpc(transport.port, "/threads/models", { threadId: "main:session-1" });
		expect(modelsRes.status).toBe(200);
		const modelsBody = (await modelsRes.json()) as { json: Array<Record<string, unknown>> };
		expect(modelsBody.json.map((model) => `${model.provider}/${model.id}`)).toEqual([
			"kimi-coding/kimi-for-coding",
			"openai-codex/gpt-5.5",
		]);

		const modelRes = await callRpc(transport.port, "/threads/model", {
			threadId: "main:session-1",
			provider: "openai-codex",
			modelId: "gpt-5.5",
		});
		expect(modelRes.status).toBe(200);
		const modelBody = (await modelRes.json()) as { json: Record<string, unknown> };
		expect(modelBody.json).toMatchObject({
			threadId: "main:session-1",
			provider: "openai-codex",
			modelId: "gpt-5.5",
			status: "selected",
		});
		expect(modelCalls).toEqual([{ provider: "openai-codex", modelId: "gpt-5.5" }]);

		const modelLogsRes = await callRpc(transport.port, "/logs/session", {
			sessionId: "session-1",
			type: "model.select.success",
		});
		expect(modelLogsRes.status).toBe(200);
		const modelLogsBody = (await modelLogsRes.json()) as { json: Array<Record<string, unknown>> };
		expect(modelLogsBody.json).toHaveLength(1);
		expect(modelLogsBody.json[0]).toMatchObject({
			sessionId: "session-1",
			threadId: "main:session-1",
			type: "model.select.success",
			source: "dashboard",
			level: "info",
			data: { provider: "openai-codex", modelId: "gpt-5.5" },
		});

		const promptLogsRes = await callRpc(transport.port, "/logs/session", {
			threadId: "main:session-1",
			type: "thread.prompt.accepted",
			limit: 1,
		});
		expect(promptLogsRes.status).toBe(200);
		const promptLogsBody = (await promptLogsRes.json()) as { json: Array<Record<string, unknown>> };
		expect(promptLogsBody.json).toHaveLength(1);
		expect(promptLogsBody.json[0]).toMatchObject({
			sessionId: "session-1",
			threadId: "main:session-1",
			type: "thread.prompt.accepted",
		});

		const listLogsRes = await callRpc(transport.port, "/logs/list");
		expect(listLogsRes.status).toBe(200);
		const listLogsBody = (await listLogsRes.json()) as { json: Array<Record<string, unknown>> };
		expect(listLogsBody.json[0]).toMatchObject({
			sessionId: "session-1",
			entryCount: 6,
		});
	});

	it("logs failed main-thread model selections without hiding the API error", async () => {
		const calls: Array<{ message: string; mode: "prompt" | "follow_up" | "steer"; images?: ThreadPromptImage[] }> =
			[];
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			mainSession: createControllableMainSession(calls, [], { acceptModelSelection: false }),
		});
		await transport.start();
		await waitForServer();

		const modelRes = await callRpc(transport.port, "/threads/model", {
			threadId: "main:session-1",
			provider: "openai-codex",
			modelId: "gpt-5.5",
		});
		expect(modelRes.status).toBe(400);

		const logsRes = await callRpc(transport.port, "/logs/session", {
			sessionId: "session-1",
			type: "model.select.failed",
		});
		expect(logsRes.status).toBe(200);
		const logsBody = (await logsRes.json()) as { json: Array<Record<string, unknown>> };
		expect(logsBody.json).toHaveLength(1);
		expect(logsBody.json[0]).toMatchObject({
			sessionId: "session-1",
			threadId: "main:session-1",
			type: "model.select.failed",
			level: "error",
			data: {
				provider: "openai-codex",
				modelId: "gpt-5.5",
				error: "Model is unavailable or not authenticated",
			},
		});
	});

	it("aborts the main dashboard thread through the main session bridge", async () => {
		let abortCount = 0;
		const mainSession: DashboardSessionSource = {
			...createControllableMainSession([]),
			abort: (threadId) => {
				expect(threadId).toBe("main:session-1");
				abortCount++;
			},
		};
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			mainSession,
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/threads/abort", { threadId: "main:session-1" });

		expect(res.status).toBe(200);
		expect(abortCount).toBe(1);
	});

	it("aborts live subagent threads by task id", async () => {
		const abortCalls: string[] = [];
		const liveState: SubAgentInstanceState = {
			instanceId: "instance-1",
			taskId: "task-1",
			definitionName: "executor",
			cwd: tmpDir,
			state: "running",
			startTime: 100,
			endTime: null,
			turnCount: 1,
			lastActivityAt: 150,
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 50,
		};
		const liveController = {
			...controller,
			getInstanceById: (threadId: string) =>
				threadId === "instance-1"
					? {
							getState: () => liveState,
						}
					: undefined,
			abortInstance: async (taskId: string) => {
				abortCalls.push(taskId);
			},
		};
		transport = new HttpServerTransport({
			controller: liveController as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/threads/abort", { threadId: "instance-1" });

		expect(res.status).toBe(200);
		expect(abortCalls).toEqual(["task-1"]);
	});

	it("serves persisted completed runs in /rpc/threads.list", async () => {
		const runStore = new SubAgentRunStore(tmpDir);
		await runStore.start({
			sessionId: "session-1",
			taskId: "task-1",
			instanceId: "instance-1",
			definitionName: "executor",
			cwd: tmpDir,
			runId: "run-a",
			runIndex: 0,
			description: "Completed executor",
			prompt: "Input brief",
			startedAt: 100,
		});
		await runStore.complete({
			sessionId: "session-1",
			taskId: "task-1",
			status: "completed",
			summary: "Output summary",
			completedAt: 200,
			turnCount: 1,
			toolCount: 2,
		});

		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/threads/list");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { json: Array<Record<string, unknown>> };
		expect(body.json).toHaveLength(1);
		expect(body.json[0]).toMatchObject({
			instanceId: "instance-1",
			taskId: "task-1",
			definitionName: "executor",
			kind: "subagent",
			state: "completed",
			sessionId: "session-1",
			runId: "run-a",
			runIndex: 0,
			description: "Completed executor",
			turnCount: 1,
			toolCount: 2,
		});
	});

	it("filters persisted subagent runs to the current main session", async () => {
		const runStore = new SubAgentRunStore(tmpDir);
		await runStore.start({
			sessionId: "current-subagent-session",
			taskId: "task-current",
			instanceId: "instance-current",
			definitionName: "executor",
			cwd: tmpDir,
			parentThreadId: "main:session-1",
			runId: "run-current",
			description: "Current session run",
			prompt: "Current input",
			startedAt: 100,
		});
		await runStore.complete({
			sessionId: "current-subagent-session",
			taskId: "task-current",
			status: "completed",
			summary: "Current output",
			completedAt: 200,
			turnCount: 1,
			toolCount: 2,
		});
		await runStore.start({
			sessionId: "old-subagent-session",
			taskId: "task-old",
			instanceId: "instance-old",
			definitionName: "executor",
			cwd: tmpDir,
			parentThreadId: "main:old-session",
			runId: "run-old",
			description: "Old session run",
			prompt: "Old input",
			startedAt: 300,
		});
		await runStore.complete({
			sessionId: "old-subagent-session",
			taskId: "task-old",
			status: "completed",
			summary: "Old output",
			completedAt: 400,
			turnCount: 3,
			toolCount: 4,
		});

		const calls: Array<{ message: string; mode: "prompt" | "follow_up" | "steer"; images?: ThreadPromptImage[] }> =
			[];
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			mainSession: createControllableMainSession(calls),
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/threads/list");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { json: Array<Record<string, unknown>> };
		expect(body.json.map((thread) => thread.instanceId)).toEqual(["main:session-1", "instance-current"]);
		expect(body.json.some((thread) => thread.instanceId === "instance-old")).toBe(false);
	});

	it("enriches event-rehydrated threads with durable run fields", async () => {
		const runStore = new SubAgentRunStore(tmpDir);
		await runStore.start({
			sessionId: "session-1",
			taskId: "task-1",
			instanceId: "instance-1",
			definitionName: "executor",
			cwd: tmpDir,
			runId: "run-a",
			prompt: "Input brief",
			modelProvider: "provider",
			modelId: "model",
			startedAt: 100,
		});
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();
		transport.emit({
			type: "instance.state",
			instanceId: "instance-1",
			taskId: "task-1",
			state: {
				instanceId: "instance-1",
				taskId: "task-1",
				definitionName: "executor",
				cwd: tmpDir,
				state: "running",
				startTime: 100,
				endTime: null,
				turnCount: 0,
				lastActivityAt: 150,
				currentTool: null,
				error: null,
				toolCount: 0,
				currentToolStartedAt: null,
				durationMs: 50,
			},
			timestamp: 150,
		} as any);

		const res = await callRpc(transport.port, "/threads/list");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { json: Array<Record<string, unknown>> };
		expect(body.json[0]).toMatchObject({
			instanceId: "instance-1",
			state: "running",
			sessionId: "session-1",
			runId: "run-a",
			modelProvider: "provider",
			modelId: "model",
		});
	});

	it("serves /rpc/lion.state endpoint", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			lionState: () => ({
				active: true,
				strategy: "simple",
				phase: "building",
				activePlanPath: null,
				activePlanSlug: null,
				planKind: null,
				activeTaskId: null,
				lastRunId: "run-1",
			}),
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/lion/state");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.json).toMatchObject({
			active: true,
			strategy: "simple",
			phase: "building",
			lastRunId: "run-1",
		});
	});

	it("serves /rpc/threads.get with 404 for unknown", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/threads/get", { threadId: "nonexistent" });
		expect(res.status).toBe(404);
	});

	it("serves live-process events for a subagent thread", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const createdEvent: SubAgentEvent = {
			type: "instance.created",
			instanceId: "instance-1",
			taskId: "task-1",
			definitionName: "executor",
			timestamp: 100,
		};
		const progressEvent: SubAgentEvent = {
			type: "progress.update",
			instanceId: "instance-1",
			taskId: "task-1",
			message: "Reading files",
			timestamp: 110,
		};
		transport.emit(createdEvent);
		transport.emit(progressEvent);

		const res = await callRpc(transport.port, "/threads/events", { threadId: "instance-1" });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { json: Array<Record<string, unknown>> };
		expect(body.json).toHaveLength(2);
		expect(body.json.map((event) => event.type)).toEqual(["instance.created", "progress.update"]);
	});

	it("serves /rpc/threads.get for projected-only completed runs", async () => {
		const runStore = new SubAgentRunStore(tmpDir);
		await runStore.start({
			sessionId: "session-1",
			taskId: "task-1",
			instanceId: "instance-1",
			definitionName: "executor",
			cwd: tmpDir,
			description: "Completed executor",
			prompt: "Input brief",
			startedAt: 100,
		});
		await runStore.complete({
			sessionId: "session-1",
			taskId: "task-1",
			status: "completed",
			summary: "Output summary",
			completedAt: 200,
			turnCount: 1,
			toolCount: 2,
		});
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/threads/get", { threadId: "instance-1" });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.json).toMatchObject({
			instanceId: "instance-1",
			state: "completed",
			sessionId: "session-1",
			description: "Completed executor",
		});
	});

	it("serves /rpc/threads.run with stored subagent input and output", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const runStore = new SubAgentRunStore(tmpDir);
		await runStore.start({
			sessionId: "session-1",
			taskId: "task-1",
			instanceId: "instance-1",
			definitionName: "executor",
			cwd: tmpDir,
			prompt: "Input brief",
			systemPrompt: "Executor prompt",
			startedAt: 100,
		});
		await runStore.complete({
			sessionId: "session-1",
			taskId: "task-1",
			status: "completed",
			summary: "Output summary",
			completedAt: 200,
			turnCount: 1,
			toolCount: 2,
		});
		transport.emit({
			type: "instance.state",
			instanceId: "instance-1",
			taskId: "task-1",
			state: {
				instanceId: "instance-1",
				taskId: "task-1",
				definitionName: "executor",
				cwd: tmpDir,
				state: "completed",
				startTime: 100,
				endTime: 200,
				turnCount: 1,
				lastActivityAt: 200,
				currentTool: null,
				error: null,
				toolCount: 2,
				currentToolStartedAt: null,
				durationMs: 100,
				sessionId: "session-1",
			},
			timestamp: Date.now(),
		} as any);

		const res = await callRpc(transport.port, "/threads/run", { threadId: "instance-1" });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.json).toMatchObject({
			sessionId: "session-1",
			taskId: "task-1",
			prompt: "Input brief",
			systemPrompt: "Executor prompt",
			status: "completed",
			summary: "Output summary",
		});
	});

	it("serves /rpc/threads.run for projected-only completed runs", async () => {
		const runStore = new SubAgentRunStore(tmpDir);
		await runStore.start({
			sessionId: "session-1",
			taskId: "task-1",
			instanceId: "instance-1",
			definitionName: "executor",
			cwd: tmpDir,
			prompt: "Input brief",
			startedAt: 100,
		});
		await runStore.complete({
			sessionId: "session-1",
			taskId: "task-1",
			status: "completed",
			summary: "Output summary",
			completedAt: 200,
			turnCount: 1,
			toolCount: 2,
		});
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/threads/run", { threadId: "instance-1" });
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.json).toMatchObject({
			sessionId: "session-1",
			taskId: "task-1",
			status: "completed",
			summary: "Output summary",
		});
	});

	it("serves /events SSE endpoint with correct headers", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();
		const port = transport.port;

		const socket = connect(port, "127.0.0.1", () => {
			socket.write("GET /events HTTP/1.1\r\nHost: localhost\r\n\r\n");
		});

		const responseReceived = new Promise<{ statusLine: string; headers: Record<string, string> }>(
			(resolve, reject) => {
				let raw = "";
				socket.setTimeout(3000);
				socket.on("data", (chunk: Buffer) => {
					raw += chunk.toString();
					const headerEnd = raw.indexOf("\r\n\r\n");
					if (headerEnd !== -1 && raw.length > headerEnd + 10) {
						socket.end();
						const headerBlock = raw.slice(0, headerEnd);
						const lines = headerBlock.split("\r\n");
						const statusLine = lines[0];
						const headers: Record<string, string> = {};
						for (let i = 1; i < lines.length; i++) {
							const m = lines[i].match(/^([^:]+):\s*(.+)$/);
							if (m) headers[m[1].toLowerCase()] = m[2];
						}
						resolve({ statusLine, headers });
					}
				});
				socket.on("error", reject);
				socket.on("timeout", () => {
					socket.end();
					reject(new Error("timeout"));
				});
			},
		);

		await new Promise((r) => setTimeout(r, 50));
		transport.emit({
			type: "instance.created",
			instanceId: "test",
			taskId: "test",
			definitionName: "test",
			timestamp: Date.now(),
		} as any);

		const result = await responseReceived;
		expect(result.statusLine).toContain("200");
		expect(result.headers["content-type"]).toBe("text/event-stream");
		expect(result.headers["cache-control"]).toBe("no-cache");
	});

	it("CORS headers present on ORPC endpoints", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const res = await callRpc(transport.port, "/threads/list");
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
	});

	it("serves static files if dist directory exists", async () => {
		const staticDir = join(tmpDir, "static");
		mkdirSync(staticDir, { recursive: true });
		writeFileSync(join(staticDir, "index.html"), "<h1>Hello</h1>", "utf-8");

		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			staticDir,
		});
		await transport.start();
		await waitForServer();

		const res = await fetch(`http://127.0.0.1:${transport.port}/`);
		expect(res.status).toBe(200);
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		const text = await res.text();
		expect(text).toContain("Hello");
	});

	it("emits events to SSE clients", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();
		const port = transport.port;

		const received = new Promise<string>((resolve, reject) => {
			const socket = connect(port, "127.0.0.1", () => {
				socket.write("GET /events HTTP/1.1\r\nHost: localhost\r\n\r\n");
			});
			let data = "";
			socket.setTimeout(5000);
			socket.on("data", (chunk: Buffer) => {
				data += chunk.toString();
				if (data.includes("data:")) {
					socket.end();
					resolve(data);
				}
			});
			socket.on("error", reject);
			socket.on("timeout", () => {
				socket.end();
				resolve(data);
			});
		});

		await new Promise((r) => setTimeout(r, 50));
		transport.emit({
			type: "instance.created",
			instanceId: "sse-test",
			taskId: "task-1",
			definitionName: "dev",
			timestamp: Date.now(),
		} as any);

		const text = await received;
		expect(text).toContain("data:");
		expect(text).toContain("instance.created");
	});

	it("stop() cleans up", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();
		const port = transport.port;
		expect(port).toBeGreaterThan(0);

		await transport.stop();

		await expect(callRpc(port, "/threads/list")).rejects.toThrow();
	});
});
