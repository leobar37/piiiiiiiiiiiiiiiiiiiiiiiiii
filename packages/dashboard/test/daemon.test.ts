import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardDaemon } from "../src/daemon.js";
import type { GenericEventBus } from "../src/types.js";

function createMockBus(): GenericEventBus & { emit(event: Record<string, unknown>): void } {
	const handlers = new Set<(event: unknown) => void>();
	return {
		subscribe(handler) {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},
		emit(event) {
			for (const h of handlers) h(event);
		},
	};
}

describe("DashboardDaemon integration", () => {
	let mockServer: { port: number; stop: ReturnType<typeof vi.fn>; hostname: string } | null = null;
	let serveCalls: unknown[] = [];
	let fileExists = new Map<string, boolean>();
	let fileContents = new Map<string, string>();
	let serveSpy: { mockRestore: () => void } | null = null;
	let fileSpy: { mockRestore: () => void } | null = null;

	function setupMockBun() {
		serveCalls = [];
		mockServer = null;
		fileExists = new Map();
		fileContents = new Map();

		// Use spyOn instead of reassigning globalThis.Bun
		serveSpy = vi.spyOn(Bun, "serve").mockImplementation((options: any) => {
			serveCalls.push(options);
			mockServer = {
				port: options.port,
				hostname: options.hostname,
				stop: vi.fn(),
			};
			return mockServer as any;
		});

		fileSpy = vi.spyOn(Bun, "file").mockImplementation((path: string) => {
			return {
				exists: () => Promise.resolve(fileExists.get(path) ?? false),
				size: (fileContents.get(path) ?? "").length,
				[Symbol.toStringTag]: "Blob",
			} as any;
		});
	}

	function restoreBun() {
		serveSpy?.mockRestore();
		fileSpy?.mockRestore();
	}

	beforeEach(() => {
		setupMockBun();
	});

	afterEach(() => {
		restoreBun();
	});

	it("starts Bun server with correct options", async () => {
		const daemon = new DashboardDaemon({ host: "127.0.0.1", port: 9393 });
		const url = await daemon.start();

		expect(Bun.serve).toHaveBeenCalledTimes(1);
		const options = serveCalls[0] as {
			hostname: string;
			port: number;
			fetch: (req: Request) => Promise<Response> | Response;
		};
		expect(options.hostname).toBe("127.0.0.1");
		expect(options.port).toBe(9393);
		expect(typeof options.fetch).toBe("function");
		expect(url.href).toBe("http://127.0.0.1:9393/");
		expect(daemon.isRunning).toBe(true);
	});

	it("returns same URL on second start", async () => {
		const daemon = new DashboardDaemon({ port: 9394 });
		const url1 = await daemon.start();
		const url2 = await daemon.start();
		expect(Bun.serve).toHaveBeenCalledTimes(1);
		expect(url1.href).toBe(url2.href);
	});

	it("serves static files", async () => {
		const daemon = new DashboardDaemon({ port: 9395, frontendDir: "/fake/dist" });
		await daemon.start();

		const options = serveCalls[0] as { fetch: (req: Request) => Promise<Response> | Response };
		fileExists.set("/fake/dist/style.css", true);
		fileContents.set("/fake/dist/style.css", "body{}");

		const req = new Request("http://localhost/style.css");
		const res = await options.fetch(req);
		expect(res.status).toBe(200);
	});

	it("falls back to index.html for unknown paths", async () => {
		const daemon = new DashboardDaemon({ port: 9396, frontendDir: "/fake/dist" });
		await daemon.start();

		const options = serveCalls[0] as { fetch: (req: Request) => Promise<Response> | Response };
		fileExists.set("/fake/dist/index.html", true);
		fileContents.set("/fake/dist/index.html", "<html></html>");

		const req = new Request("http://localhost/unknown-route");
		const res = await options.fetch(req);
		expect(res.status).toBe(200);
	});

	it("delegates /api to oRPC handler", async () => {
		const daemon = new DashboardDaemon({ port: 9397 });
		await daemon.start();

		const options = serveCalls[0] as { fetch: (req: Request) => Promise<Response> | Response };
		const req = new Request("http://localhost/api/dashboard.state.get", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		// oRPC will return 404 because no real procedure path matches in test,
		// but it should be handled by the RPCHandler (not static files)
		const res = await options.fetch(req);
		// RPCHandler returns 404 for unknown procedure paths, not "Not Found" string
		expect(res.status).toBe(404);
	});

	it("stops server and resets state", async () => {
		const daemon = new DashboardDaemon({ port: 9398 });
		await daemon.start();
		daemon.stop();

		expect(mockServer?.stop).toHaveBeenCalledTimes(1);
		expect(daemon.isRunning).toBe(false);
		expect(daemon.url).toBeNull();
		expect(daemon.uptime).toBe(0);
	});

	it("cleans up bridged buses on stop", async () => {
		const daemon = new DashboardDaemon({ port: 9399 });
		const bus = createMockBus();
		daemon.bridge(bus, "lion");

		let unsubCalled = false;
		// Override the bus subscribe to track cleanup
		const customBus = {
			subscribe(handler: (event: unknown) => void) {
				bus.subscribe(handler);
				return () => {
					unsubCalled = true;
				};
			},
		};
		daemon.bridge(customBus, "subagent");

		await daemon.start();
		daemon.stop();
		expect(unsubCalled).toBe(true);
	});
});
