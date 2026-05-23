import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { DashboardEventBridge } from "./bridge.js";
import type { DashboardEventPayload, LionDashboardState } from "./router.js";
import { createDashboardRouter } from "./router.js";
import { SessionHost } from "./session-host.js";
import type { DashboardConfig, GenericEventBus } from "./types.js";

/**
 * Real-time web dashboard for Pi.
 *
 * Starts an HTTP server (Bun.serve) that exposes:
 * - `/api` — oRPC endpoints (state snapshot + SSE event stream)
 * - `/` — static React SPA
 *
 * Usage from the Lion extension:
 *
 * ```ts
 * import { DashboardDaemon } from "@local/pi-dashboard";
 *
 * const daemon = new DashboardDaemon();
 *
 * // Bridge event buses (call before or after start)
 * daemon.bridge(runtime.events, "lion");
 * daemon.bridge(controller.getEventBus(), "subagent");
 *
 * // Start server
 * const url = await daemon.start(9393);
 * console.log(`Dashboard at ${url.href}`);
 *
 * // Stop on shutdown
 * daemon.stop();
 * ```
 */
export class DashboardDaemon {
	private handler: RPCHandler<any> | null = null;
	private server: Server | null = null;
	private config: Required<DashboardConfig>;
	private startTime = 0;
	private eventBridge = new DashboardEventBridge();
	private bridgeCleanups: Array<() => void> = [];
	private getLionState: (() => LionDashboardState | null) | null = null;
	readonly sessionHost = new SessionHost();

	constructor(config?: DashboardConfig) {
		const __dirname = dirname(fileURLToPath(import.meta.url));
		this.config = {
			host: config?.host ?? "127.0.0.1",
			port: config?.port ?? 9393,
			frontendDir: config?.frontendDir ?? join(__dirname, "..", "frontend", "dist"),
		};
	}

	/**
	 * Subscribe to an event bus and forward all events to connected dashboard clients.
	 * Can be called before or after `start()`.
	 */
	bridge(bus: GenericEventBus, source: "lion" | "subagent" = "lion"): void {
		const unsub = this.eventBridge.bridge(bus, source);
		this.bridgeCleanups.push(unsub);
	}

	publishEvent(payload: DashboardEventPayload): void {
		this.eventBridge.publish(payload);
	}

	setLionStateGetter(getter: () => LionDashboardState | null): void {
		this.getLionState = getter;
	}

	/**
	 * Start the HTTP server. Returns the URL where the dashboard is reachable.
	 * If already running, returns the existing URL.
	 */
	async start(port?: number): Promise<URL> {
		if (this.server) {
			return this.url!;
		}

		this.startTime = Date.now();
		const listenPort = port ?? this.config.port;
		const router = createDashboardRouter(
			this.eventBridge,
			() => this.startTime,
			this.getLionState ?? undefined,
			this.sessionHost,
		);
		this.handler = new RPCHandler(router, {
			plugins: [
				new CORSPlugin({
					origin: (origin) => origin,
					allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
				}),
			],
		});

		this.server = Bun.serve({
			hostname: this.config.host,
			port: listenPort,
			fetch: async (req: Request) => {
				const url = new URL(req.url);

				// API routes → oRPC handler
				if (url.pathname.startsWith("/api")) {
					const { matched, response } = await this.handler!.handle(req, {
						prefix: "/api",
						context: {},
					});
					if (matched) return response;
				}

				// Static files → frontend dist
				const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
				const safePath = filePath.replace(/\.{2,}/g, "").replace(/^\/+/, "");
				const file = Bun.file(join(this.config.frontendDir, safePath));
				const exists = await file.exists();
				if (exists) {
					return new Response(file);
				}

				// SPA fallback: serve index.html for unknown paths
				const indexFile = Bun.file(join(this.config.frontendDir, "index.html"));
				const indexExists = await indexFile.exists();
				if (indexExists) {
					return new Response(indexFile);
				}

				return new Response("Not Found", { status: 404 });
			},
		});

		return this.url!;
	}

	stop(): void {
		if (!this.server) return;

		// Unsubscribe from all bridged buses
		for (const cleanup of this.bridgeCleanups) {
			cleanup();
		}
		this.bridgeCleanups = [];
		this.eventBridge.clear();

		// Dispose all live sessions
		this.sessionHost.dispose().catch(() => {});

		// Stop HTTP server
		this.server.stop(true);
		this.server = null;
		this.handler = null;
		this.startTime = 0;
	}

	get isRunning(): boolean {
		return this.server !== null;
	}

	get url(): URL | null {
		if (!this.server) return null;
		return new URL(`http://${this.config.host}:${this.server.port}`);
	}

	get uptime(): number {
		if (!this.startTime) return 0;
		return Date.now() - this.startTime;
	}
}

type Server = ReturnType<typeof Bun.serve>;
