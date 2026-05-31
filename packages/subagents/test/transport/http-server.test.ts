import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubAgentEventBus } from "../../src/event-bus.js";
import { SubAgentRunStore } from "../../src/run-store.js";
import { HttpServerTransport } from "../../src/transport/http-server.js";
import type { DashboardSessionSource } from "../../src/transport/types.js";
import type { SubAgentInstanceState } from "../../src/types.js";
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

type MockController = ReturnType<typeof createMockController>;

describe("HttpServerTransport", () => {
	let tmpDir: string;
	let controller: MockController;
	let transport: HttpServerTransport;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "http-server-test-"));
		controller = createMockController(tmpDir);
		const mock = createMockBunServe();
		vi.stubGlobal("Bun", mock);
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
		vi.unstubAllGlobals();
	});

	/**
	 * Node's server.listen() is async.  Yield one microtask so
	 * that server.address() returns a real port after Bun.serve().
	 */
	async function waitForServer(): Promise<void> {
		await new Promise<void>((resolve) => setImmediate(resolve));
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

	it("serves /api/threads endpoint", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
			mainSession: createMockMainSession(),
		});
		await transport.start();
		await waitForServer();

		const res = await fetch(`http://127.0.0.1:${transport.port}/api/threads`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body)).toBe(true);
	});

	it("serves /api/lion/state endpoint", async () => {
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

		const res = await fetch(`http://127.0.0.1:${transport.port}/api/lion/state`);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			active: true,
			strategy: "simple",
			phase: "building",
			lastRunId: "run-1",
		});
	});

	it("serves /api/threads/:id endpoint with 404 for unknown", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const res = await fetch(`http://127.0.0.1:${transport.port}/api/threads/nonexistent`);
		expect(res.status).toBe(404);
	});

	it("serves /api/threads/:id/run with stored subagent input and output", async () => {
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

		const res = await fetch(`http://127.0.0.1:${transport.port}/api/threads/instance-1/run`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({
			sessionId: "session-1",
			taskId: "task-1",
			prompt: "Input brief",
			systemPrompt: "Executor prompt",
			status: "completed",
			summary: "Output summary",
		});
	});

	it("serves /api/events SSE endpoint with correct headers", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();
		const port = transport.port;

		// Connect TCP socket and send GET /events, then emit an event so the
		// ReadableStream has data to flush.
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

		// Yield to let the middleware add the SSE client, then emit data
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

	it("CORS headers present on API endpoints", async () => {
		transport = new HttpServerTransport({
			controller: controller as any,
			port: 0,
			host: "127.0.0.1",
		});
		await transport.start();
		await waitForServer();

		const res = await fetch(`http://127.0.0.1:${transport.port}/api/threads`);
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

		await expect(fetch(`http://127.0.0.1:${port}/api/threads`)).rejects.toThrow();
	});
});
