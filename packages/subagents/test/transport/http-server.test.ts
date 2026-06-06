import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
	calls: Array<{ message: string; mode: "prompt" | "follow_up" | "steer" }>,
): DashboardSessionSource {
	return {
		getThread: () => ({
			instanceId: "main:session-1",
			taskId: "main",
			definitionName: "main-agent",
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
		}),
		getMessages: () => [],
		getEvents: () => [],
		sendMessage: async (_threadId, message, mode) => {
			calls.push({ message, mode });
		},
		getCommands: () => [{ name: "lion-build", description: "Activate Lion build mode", source: "extension" }],
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

	it("serves dashboard prompt and commands for the main thread", async () => {
		const calls: Array<{ message: string; mode: "prompt" | "follow_up" | "steer" }> = [];
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			mainSession: createControllableMainSession(calls),
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

		const calls: Array<{ message: string; mode: "prompt" | "follow_up" | "steer" }> = [];
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
