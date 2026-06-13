import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AuthStorage, ModelRegistry, SettingsManager } from "@earendil-works/pi-coding-agent";
import { RPCHandler } from "@orpc/server/fetch";
import type { SubagentsApiContext } from "../api/context.js";
import { createSubagentsRouter } from "../api/router.js";
import { DashboardThreadSessionCache } from "../api/session-control.js";
import { DashboardSessionLogStore } from "../api/session-log-store.js";
import { StandaloneSessionManager } from "../api/standalone-sessions.js";
import type { SubAgentController } from "../controller.js";
import { LionChecklistService } from "../lion/checklist-service.js";
import type { LionStrategyName } from "../lion/types.js";
import { SubAgentRunStore } from "../run-store.js";
import { TaskService } from "../tasks/service.js";
import { DashboardStateManager } from "./state-manager.js";
import type { DashboardLionState, DashboardSessionSource, SubAgentTransport, SubAgentTransportEvent } from "./types.js";

export interface HttpServerTransportOptions {
	port?: number;
	host?: string;
	controller: SubAgentController;
	/**
	 * Path to the frontend static files directory.
	 * Defaults to the bundled frontend/dist relative to this file.
	 */
	staticDir?: string;
	serveFrontend?: boolean;
	mainSession?: DashboardSessionSource;
	lionState?: () => DashboardLionState;
	setLionStrategy?(strategy: LionStrategyName): Promise<void> | void;
}

function isDashboardMode(): boolean {
	return process.env.LION_DASHBOARD_MODE === "true";
}

interface SseClient {
	controller: ReadableStreamDefaultController<Uint8Array>;
	instanceId?: string;
	lastActivityAt: number;
}

interface BunHttpServer {
	port: number;
	stop(force?: boolean): void;
}

declare const Bun: {
	serve(options: { port: number; hostname: string; fetch(req: Request): Response | Promise<Response> }): BunHttpServer;
};

const encoder = new TextEncoder();

function resolveStaticDir(options: HttpServerTransportOptions): string {
	if (options.staticDir) return options.staticDir;
	const baseDir = import.meta.dirname ?? ".";
	const candidates = [
		// TanStack Start outputs the static shell under dist/client
		join(baseDir, "..", "frontend", "dist", "client"),
		join(baseDir, "..", "..", "frontend", "dist", "client"),
		// Fallback to legacy flat dist layout
		join(baseDir, "..", "frontend", "dist"),
		join(baseDir, "..", "..", "frontend", "dist"),
	];
	return candidates.find((candidate) => existsSync(join(candidate, "index.html"))) ?? candidates[0];
}

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

export class HttpServerTransport implements SubAgentTransport {
	readonly id = "http-server";
	private server: BunHttpServer | null = null;
	private clients = new Set<SseClient>();
	private staticDir: string;
	private sseCleanupTimer: ReturnType<typeof setInterval> | null = null;
	/**
	 * Dashboard state manager: manages live and virtual instances, persists events.
	 * Already rehydrates from disk in start(). Exposed for explicit post-start replay
	 * from the dashboard layer.
	 */
	readonly stateManager: DashboardStateManager;
	private unsubscribeMainSession?: () => void;
	private runStore: SubAgentRunStore;
	private checklistService: LionChecklistService;
	private taskService: TaskService;
	private sessionCache: DashboardThreadSessionCache;
	private logStore: DashboardSessionLogStore;
	private orpcHandler: RPCHandler<SubagentsApiContext>;
	private orpcContext: SubagentsApiContext;
	private standaloneSessions: StandaloneSessionManager;

	constructor(private options: HttpServerTransportOptions) {
		this.staticDir = resolveStaticDir(options);
		this.runStore = new SubAgentRunStore(options.controller.getCwd());
		this.checklistService = new LionChecklistService();
		this.taskService = new TaskService(options.controller.getCwd(), (event) => this.emit(event));
		this.stateManager = new DashboardStateManager(options.controller.getCwd(), this.runStore);
		this.sessionCache = new DashboardThreadSessionCache((event) => this.emit(event));
		this.logStore = new DashboardSessionLogStore(options.controller.getCwd());
		this.standaloneSessions = new StandaloneSessionManager(
			options.controller.getCwd(),
			options.controller.getModelRegistry() ?? ModelRegistry.create(AuthStorage.create()),
			options.controller.getSettingsManager() ?? SettingsManager.create(options.controller.getCwd()),
			options.controller.getAuthStorage(),
			(event) => this.emit(event),
		);
		this.orpcContext = {
			controller: options.controller,
			runStore: this.runStore,
			stateManager: this.stateManager,
			mainSession: options.mainSession,
			lionState: options.lionState,
			setLionStrategy: options.setLionStrategy,
			checklistService: this.checklistService,
			taskService: this.taskService,
			sessionCache: this.sessionCache,
			logStore: this.logStore,
			emitEvent: (event) => this.emit(event),
			cwd: options.controller.getCwd(),
			standaloneSessions: this.standaloneSessions,
		};
		const router = createSubagentsRouter(this.orpcContext);
		this.orpcHandler = new RPCHandler(router);
		this.sseCleanupTimer = setInterval(() => this.cleanupStaleSseClients(), 30000);
	}

	get port(): number {
		return this.server?.port ?? 0;
	}

	async start(): Promise<void> {
		await this.stateManager.loadFromRunStore();
		this.unsubscribeMainSession = this.options.mainSession?.subscribe((event) => this.emitToClients(event));
		this.server = Bun.serve({
			port: this.options.port ?? 0,
			hostname: this.options.host ?? "0.0.0.0",
			fetch: (req) => this.handleRequest(req),
		});
	}

	/**
	 * Replay currently tracked live-process events to connected SSE clients.
	 */
	async replayEventsToSse(): Promise<void> {
		const instanceIds = await this.stateManager.getAllInstanceIds();
		for (const instanceId of instanceIds) {
			const events = await this.stateManager.getEvents(instanceId);
			for (const event of events) {
				const enriched = { ...event, instanceId } as SubAgentTransportEvent;
				this.emitToClients(enriched);
			}
		}
	}

	async stop(): Promise<void> {
		if (this.sseCleanupTimer) {
			clearInterval(this.sseCleanupTimer);
			this.sseCleanupTimer = null;
		}
		for (const client of this.clients) {
			try {
				client.controller.close();
			} catch {
				/* best effort */
			}
		}
		this.clients.clear();
		this.unsubscribeMainSession?.();
		this.unsubscribeMainSession = undefined;
		this.sessionCache.disposeAll();
		this.server?.stop(true);
		this.server = null;
	}

	emit(event: SubAgentTransportEvent): void {
		// Persist and update state manager
		if ("instanceId" in event && typeof event.instanceId === "string") {
			this.stateManager.appendEvent(event.instanceId, event).catch(() => {});
		}

		if (event.type === "instance.state") {
			this.stateManager.registerLiveInstance(event.state);
		}

		this.logTransportEvent(event).catch(() => {});
		this.emitToClients(event);
	}

	private async logTransportEvent(event: SubAgentTransportEvent): Promise<void> {
		if (!("instanceId" in event) || typeof event.instanceId !== "string") return;
		const sessionId = await this.resolveSessionId(event.instanceId, event);
		if (!sessionId) return;
		this.logStore.append({
			sessionId,
			threadId: event.instanceId,
			type: "dashboard.event",
			source: "sse",
			level: "debug",
			data: { event },
		});
	}

	private async resolveSessionId(instanceId: string, event?: SubAgentTransportEvent): Promise<string | null> {
		if (event?.type === "instance.state" && "state" in event && event.state.sessionId) {
			return event.state.sessionId;
		}
		const main = this.options.mainSession?.getThread();
		if (main?.instanceId === instanceId && main.sessionId) return main.sessionId;
		const state = this.stateManager.getInstance(instanceId);
		if (state?.sessionId) return state.sessionId;
		const record = (await this.runStore.list()).find((candidate) => candidate.instanceId === instanceId);
		return record?.sessionId ?? null;
	}

	private emitToClients(event: SubAgentTransportEvent): void {
		const payload = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
		for (const client of this.clients) {
			// If client subscribed to a specific instance, filter
			if (client.instanceId && "instanceId" in event && event.instanceId !== client.instanceId) {
				continue;
			}
			try {
				client.controller.enqueue(payload);
				client.lastActivityAt = Date.now();
			} catch {
				// Client disconnected — remove
				this.clients.delete(client);
			}
		}
	}

	private async handleRequest(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const pathname = url.pathname;

		if (req.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		const frontendDisabled = isDashboardMode() && this.options.serveFrontend !== true;

		if (req.method === "GET" && pathname === "/") {
			if (frontendDisabled) {
				return new Response("Not Found", { status: 404 });
			}
			return this.serveStaticFile("index.html", "text/html; charset=utf-8");
		}

		if (req.method === "GET" && pathname.startsWith("/assets/")) {
			if (frontendDisabled) {
				return new Response("Not Found", { status: 404 });
			}
			return this.serveAsset(pathname);
		}

		if (req.method === "GET" && pathname === "/events") {
			return this.serveEvents(req, url);
		}

		// ORPC RPC handler
		const orpcResult = await this.orpcHandler.handle(req, { prefix: "/rpc", context: this.orpcContext });
		if (orpcResult.matched) {
			return this.withCors(orpcResult.response);
		}

		// Fallback to index.html for SPA routing
		if (req.method === "GET") {
			if (frontendDisabled) {
				return new Response("Not Found", { status: 404 });
			}
			return this.serveStaticFile("index.html", "text/html; charset=utf-8");
		}

		return new Response("Not Found", { status: 404 });
	}

	private withCors(response: Response): Response {
		for (const [key, value] of Object.entries(CORS_HEADERS)) {
			response.headers.set(key, value);
		}
		return response;
	}

	private serveStaticFile(filename: string, contentType: string): Response {
		try {
			const path = join(this.staticDir, filename);
			const content = readFileSync(path);
			return new Response(content, {
				headers: {
					"Content-Type": contentType,
					"Cache-Control": "no-store",
				},
			});
		} catch {
			return new Response("Not Found", { status: 404 });
		}
	}

	private serveAsset(pathname: string): Response {
		const filename = pathname.slice(1); // remove leading /
		const ext = filename.split(".").pop() ?? "";
		const contentType = this.resolveContentType(ext);
		return this.serveStaticFile(filename, contentType);
	}

	private resolveContentType(ext: string): string {
		switch (ext) {
			case "js":
				return "application/javascript";
			case "css":
				return "text/css";
			case "svg":
				return "image/svg+xml";
			case "png":
				return "image/png";
			case "json":
				return "application/json";
			default:
				return "application/octet-stream";
		}
	}

	private serveEvents(req: Request, url: URL): Response {
		const instanceId = url.searchParams.get("instanceId") ?? undefined;

		const stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				const client: SseClient = { controller, instanceId, lastActivityAt: Date.now() };
				this.clients.add(client);

				req.signal.addEventListener("abort", () => {
					this.clients.delete(client);
					try {
						controller.close();
					} catch {
						/* best effort */
					}
				});
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				...CORS_HEADERS,
			},
		});
	}

	private cleanupStaleSseClients(): void {
		for (const client of this.clients) {
			const heartbeat = encoder.encode(":heartbeat\n\n");
			try {
				client.controller.enqueue(heartbeat);
				client.lastActivityAt = Date.now();
			} catch {
				this.clients.delete(client);
			}
		}
	}
}
