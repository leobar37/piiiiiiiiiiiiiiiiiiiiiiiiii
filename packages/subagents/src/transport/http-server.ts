import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SubAgentController } from "../controller.js";
import { SubAgentRunStore } from "../run-store.js";
import { DashboardStateManager } from "./state-manager.js";
import type {
	DashboardLionState,
	DashboardSessionSource,
	DashboardThreadState,
	SubAgentTransport,
	SubAgentTransportEvent,
} from "./types.js";

export interface HttpServerTransportOptions {
	port?: number;
	host?: string;
	controller: SubAgentController;
	/**
	 * Path to the frontend static files directory.
	 * Defaults to the bundled frontend/dist relative to this file.
	 */
	staticDir?: string;
	mainSession?: DashboardSessionSource;
	lionState?: () => DashboardLionState;
}

function isDashboardMode(): boolean {
	return process.env.LION_DASHBOARD_MODE === "true";
}

interface SseClient {
	controller: ReadableStreamDefaultController<Uint8Array>;
	instanceId?: string;
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
	// Default: frontend/dist relative to this file's location in dist/
	return join(import.meta.dirname ?? ".", "..", "..", "frontend", "dist");
}

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

const DEFAULT_LION_STATE: DashboardLionState = {
	active: false,
	strategy: "plan",
	phase: "planning",
	activePlanPath: null,
	activePlanSlug: null,
	planKind: null,
	activeTaskId: null,
	lastRunId: null,
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

	constructor(private options: HttpServerTransportOptions) {
		this.staticDir = resolveStaticDir(options);
		this.stateManager = new DashboardStateManager(options.controller.getCwd());
		this.runStore = new SubAgentRunStore(options.controller.getCwd());
		this.sseCleanupTimer = setInterval(() => this.cleanupStaleSseClients(), 30000);
	}

	get port(): number {
		return this.server?.port ?? 0;
	}

	async start(): Promise<void> {
		await this.stateManager.rehydrate();
		this.unsubscribeMainSession = this.options.mainSession?.subscribe((event) => this.emitToClients(event));
		this.server = Bun.serve({
			port: this.options.port ?? 0,
			hostname: this.options.host ?? "0.0.0.0",
			fetch: (req) => this.handleRequest(req),
		});
	}

	/**
	 * Replay all persisted historical events to currently connected SSE clients.
	 * Events are emitted to clients without re-persisting (they are already on disk).
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

		this.emitToClients(event);
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
			} catch {
				/* client may be disconnected, remove lazily */
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

		if (req.method === "GET" && pathname === "/") {
			if (isDashboardMode()) {
				return new Response("Not Found", { status: 404 });
			}
			return this.serveStaticFile("index.html", "text/html; charset=utf-8");
		}

		if (req.method === "GET" && pathname.startsWith("/assets/")) {
			if (isDashboardMode()) {
				return new Response("Not Found", { status: 404 });
			}
			return this.serveAsset(pathname);
		}

		if (req.method === "GET" && pathname === "/api/lion/state") {
			return this.withCors(this.serveLionState());
		}

		if (req.method === "GET" && pathname === "/api/instances") {
			return this.withCors(this.serveInstances());
		}

		if (req.method === "GET" && pathname === "/api/threads") {
			return this.withCors(this.serveThreads());
		}

		if (req.method === "GET" && pathname.startsWith("/api/threads/")) {
			const rest = pathname.slice("/api/threads/".length);
			const segments = rest.split("/");
			const threadId = decodeURIComponent(segments[0]);

			if (segments.length === 1) {
				return this.withCors(this.serveThread(threadId));
			}
			if (segments.length === 2 && segments[1] === "session") {
				return this.withCors(await this.serveSession(threadId));
			}
			if (segments.length === 2 && segments[1] === "events") {
				return this.withCors(await this.serveThreadEvents(threadId));
			}
			if (segments.length === 2 && segments[1] === "messages") {
				return this.withCors(await this.serveMessages(threadId));
			}
			if (segments.length === 2 && segments[1] === "run") {
				return this.withCors(await this.serveRun(threadId));
			}
		}

		if (req.method === "GET" && pathname.startsWith("/api/instances/")) {
			const rest = pathname.slice("/api/instances/".length);
			const segments = rest.split("/");
			const instanceId = decodeURIComponent(segments[0]);

			if (segments.length === 1) {
				return this.withCors(this.serveInstance(instanceId));
			}
			if (segments.length === 2 && segments[1] === "session") {
				return this.withCors(await this.serveSession(instanceId));
			}
			if (segments.length === 2 && segments[1] === "events") {
				return this.withCors(await this.serveInstanceEvents(instanceId));
			}
			if (segments.length === 2 && segments[1] === "messages") {
				return this.withCors(await this.serveMessages(instanceId));
			}
			if (segments.length === 2 && segments[1] === "run") {
				return this.withCors(await this.serveRun(instanceId));
			}
		}

		if (req.method === "GET" && pathname === "/events") {
			return this.serveEvents(req, url);
		}

		// Fallback to index.html for SPA routing
		if (req.method === "GET") {
			if (isDashboardMode()) {
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
			return new Response(content, { headers: { "Content-Type": contentType } });
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

	private serveInstances(): Response {
		return Response.json(this.getSubagentThreads());
	}

	private serveLionState(): Response {
		return Response.json(this.options.lionState?.() ?? DEFAULT_LION_STATE);
	}

	private serveThreads(): Response {
		const main = this.options.mainSession?.getThread();
		const threads = main ? [main, ...this.getSubagentThreads()] : this.getSubagentThreads();
		return Response.json(threads);
	}

	private getSubagentThreads(): DashboardThreadState[] {
		const controllerStates = this.options.controller.getInstanceStates();
		for (const state of controllerStates) {
			this.stateManager.registerLiveInstance(state);
		}
		return this.stateManager.getAllInstances();
	}

	private serveInstance(instanceId: string): Response {
		return this.serveThread(instanceId);
	}

	private serveThread(threadId: string): Response {
		const main = this.options.mainSession?.getThread();
		if (main?.instanceId === threadId) {
			return Response.json(main);
		}
		const state = this.stateManager.getInstance(threadId);
		if (!state) {
			return new Response("Not Found", { status: 404 });
		}
		return Response.json(state);
	}

	private async serveInstanceEvents(instanceId: string): Promise<Response> {
		return this.serveThreadEvents(instanceId);
	}

	private async serveThreadEvents(threadId: string): Promise<Response> {
		const main = this.options.mainSession?.getThread();
		if (main?.instanceId === threadId) {
			return Response.json(this.options.mainSession?.getEvents(threadId) ?? []);
		}
		const events = await this.stateManager.getEvents(threadId);
		return Response.json(events);
	}

	private async serveSession(threadId: string): Promise<Response> {
		const mainMessages = this.options.mainSession?.getMessages(threadId);
		const main = this.options.mainSession?.getThread();
		if (mainMessages && main?.instanceId === threadId) {
			return Response.json({
				sessionId: main.sessionId,
				messages: mainMessages,
			});
		}

		const instance = this.options.controller.getInstanceById(threadId);
		if (instance) {
			const state = instance.getState();
			if (state.state === "created" || state.state === "starting") {
				return new Response("Session not ready", { status: 503, headers: { "Retry-After": "1" } });
			}
			const rpcState = instance.getRpcState();
			const messages = instance.getMessages();
			return Response.json({
				sessionId: rpcState.sessionId,
				messages,
			});
		}

		// Virtual instance: read from SessionManager directly
		const virtual = this.stateManager.getInstance(threadId);
		if (virtual?.sessionFile) {
			try {
				const sm = SessionManager.open(virtual.sessionFile);
				const context = sm.buildSessionContext();
				return Response.json({
					sessionId: sm.getSessionId(),
					messages: context.messages,
				});
			} catch {
				return new Response("Session not accessible", { status: 500 });
			}
		}

		return new Response("Not Found", { status: 404 });
	}

	private async serveMessages(threadId: string): Promise<Response> {
		const mainMessages = this.options.mainSession?.getMessages(threadId);
		if (mainMessages) {
			return Response.json(mainMessages);
		}

		const instance = this.options.controller.getInstanceById(threadId);
		if (instance) {
			const state = instance.getState();
			if (state.state === "created" || state.state === "starting") {
				return new Response("Session not ready", { status: 503, headers: { "Retry-After": "1" } });
			}
			const messages = instance.getMessages();
			return Response.json(messages);
		}

		// Virtual instance: read from SessionManager directly
		const virtual = this.stateManager.getInstance(threadId);
		if (virtual?.sessionFile) {
			try {
				const sm = SessionManager.open(virtual.sessionFile);
				const context = sm.buildSessionContext();
				return Response.json(context.messages);
			} catch {
				return new Response("Session not accessible", { status: 500 });
			}
		}

		return new Response("Not Found", { status: 404 });
	}

	private async serveRun(threadId: string): Promise<Response> {
		const main = this.options.mainSession?.getThread();
		if (main?.instanceId === threadId) {
			return new Response("Run record not available", { status: 404 });
		}

		const live = this.options.controller.getInstanceById(threadId)?.getState();
		const state = live ?? this.stateManager.getInstance(threadId);
		if (!state?.sessionId) {
			return new Response("Run record not available", { status: 404 });
		}

		const record = await this.runStore.read(state.sessionId, state.taskId);
		if (!record) {
			return new Response("Run record not found", { status: 404 });
		}
		return Response.json(record);
	}

	private serveEvents(req: Request, url: URL): Response {
		const instanceId = url.searchParams.get("instanceId") ?? undefined;

		const stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				const client: SseClient = { controller, instanceId };
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
		const heartbeat = encoder.encode(":heartbeat\n\n");
		for (const client of this.clients) {
			try {
				client.controller.enqueue(heartbeat);
			} catch {
				this.clients.delete(client);
			}
		}
	}
}
