import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SubAgentController } from "../controller.js";
import { LionChecklistService } from "../lion/checklist-service.js";
import type { LionChecklistKind } from "../lion/types.js";
import { SubAgentRunStore } from "../run-store.js";
import type { SubAgentRunRecord, SubAgentState } from "../types.js";
import { DashboardStateManager, type VirtualInstance } from "./state-manager.js";
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
		// dist/index.js -> packages/subagents/frontend/dist
		join(baseDir, "..", "frontend", "dist"),
		// src/transport/http-server.ts -> packages/subagents/frontend/dist
		join(baseDir, "..", "..", "frontend", "dist"),
	];
	return candidates.find((candidate) => existsSync(join(candidate, "index.html"))) ?? candidates[0];
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
	private checklistService: LionChecklistService;

	constructor(private options: HttpServerTransportOptions) {
		this.staticDir = resolveStaticDir(options);
		this.runStore = new SubAgentRunStore(options.controller.getCwd());
		this.checklistService = new LionChecklistService();
		this.stateManager = new DashboardStateManager(options.controller.getCwd(), this.runStore);
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

		if (req.method === "GET" && pathname === "/api/lion/checklist") {
			return this.withCors(this.serveLionChecklist(url));
		}

		if (req.method === "GET" && pathname === "/api/instances") {
			return this.withCors(await this.serveInstances());
		}

		if (req.method === "GET" && pathname === "/api/threads") {
			return this.withCors(await this.serveThreads());
		}

		if (req.method === "GET" && pathname.startsWith("/api/threads/")) {
			const rest = pathname.slice("/api/threads/".length);
			const segments = rest.split("/");
			const threadId = decodeURIComponent(segments[0]);

			if (segments.length === 1) {
				return this.withCors(await this.serveThread(threadId));
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
				return this.withCors(await this.serveInstance(instanceId));
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

	private async serveInstances(): Promise<Response> {
		return Response.json(await this.getSubagentThreads());
	}

	private serveLionState(): Response {
		return Response.json(this.options.lionState?.() ?? DEFAULT_LION_STATE);
	}

	private serveLionChecklist(url: URL): Response {
		const kind = url.searchParams.get("kind");
		if (kind !== "plan" && kind !== "review") {
			return new Response("Invalid checklist kind", { status: 400 });
		}
		const reference = url.searchParams.get("reference") ?? undefined;
		const state = this.options.lionState?.() ?? DEFAULT_LION_STATE;
		try {
			return Response.json(
				this.checklistService.read({
					kind: kind as LionChecklistKind,
					reference,
					activePlanPath: state.activePlanPath,
					cwd: this.options.controller.getCwd(),
				}),
			);
		} catch (error) {
			return new Response(error instanceof Error ? error.message : String(error), { status: 404 });
		}
	}

	private async serveThreads(): Promise<Response> {
		const main = this.options.mainSession?.getThread();
		const subagents = await this.getSubagentThreads();
		const threads = main ? [main, ...subagents] : subagents;
		return Response.json(threads);
	}

	private async getSubagentThreads(): Promise<DashboardThreadState[]> {
		const controllerStates = this.options.controller.getInstanceStates();
		for (const state of controllerStates) {
			this.stateManager.registerLiveInstance(state);
		}
		// Ensure virtual instances from runStore are loaded
		await this.stateManager.loadFromRunStore();
		const runRecords = await this.runStore.list();
		const byInstanceId = new Map<string, DashboardThreadState>();
		const runsByInstanceId = new Map(runRecords.map((record) => [record.instanceId, record]));

		for (const record of runRecords) {
			byInstanceId.set(record.instanceId, projectRunRecord(record));
		}

		for (const state of this.stateManager.getAllInstances()) {
			const runRecord = runsByInstanceId.get(state.instanceId);
			byInstanceId.set(state.instanceId, runRecord ? mergeRunRecordIntoThread(state, runRecord) : state);
		}

		return Array.from(byInstanceId.values()).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
	}

	private async serveInstance(instanceId: string): Promise<Response> {
		return this.serveThread(instanceId);
	}

	private async serveThread(threadId: string): Promise<Response> {
		const main = this.options.mainSession?.getThread();
		if (main?.instanceId === threadId) {
			return Response.json(main);
		}
		const state = this.stateManager.getInstance(threadId);
		if (!state) {
			const record = (await this.runStore.list()).find((candidate) => candidate.instanceId === threadId);
			if (!record) {
				return new Response("Not Found", { status: 404 });
			}
			return Response.json(projectRunRecord(record));
		}
		const record = (await this.runStore.list()).find((candidate) => candidate.instanceId === threadId);
		return Response.json(record ? mergeRunRecordIntoThread(state, record) : state);
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
		if (virtual?.sessionFile || virtual?.sessionId) {
			const sm = await this.tryOpenSession(threadId, virtual);
			if (sm) {
				const context = sm.buildSessionContext();
				return Response.json({
					sessionId: sm.getSessionId(),
					messages: context.messages,
				});
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
		if (virtual?.sessionFile || virtual?.sessionId) {
			const sm = await this.tryOpenSession(threadId, virtual);
			if (sm) {
				return Response.json(sm.buildSessionContext().messages);
			}
		}

		return new Response("Not Found", { status: 404 });
	}

	/**
	 * Try to open a SessionManager for a virtual instance.
	 * Falls back to constructing the session path from the run record
	 * if sessionFile is not directly available (e.g. after restart).
	 */
	private async tryOpenSession(threadId: string, virtual: VirtualInstance): Promise<SessionManager | null> {
		// Direct path available (handed over from live instance)
		if (virtual.sessionFile) {
			try {
				return SessionManager.open(virtual.sessionFile);
			} catch {
				// Fall through to try run record
			}
		}

		// Reconstruct from run record
		if (virtual.sessionId) {
			try {
				const records = await this.runStore.list();
				const record = records.find((r) => r.instanceId === threadId);
				if (record?.cwd && record.sessionId) {
					const sessionPath = join(record.cwd, ".pi", "sessions", `${record.sessionId}.json`);
					return SessionManager.open(sessionPath);
				}
			} catch {
				// Not found or inaccessible
			}
		}

		return null;
	}

	private async serveRun(threadId: string): Promise<Response> {
		const main = this.options.mainSession?.getThread();
		if (main?.instanceId === threadId) {
			return new Response("Run record not available", { status: 404 });
		}

		const live = this.options.controller.getInstanceById(threadId)?.getState();
		const state = live ?? this.stateManager.getInstance(threadId);
		if (!state?.sessionId) {
			const record = (await this.runStore.list()).find((candidate) => candidate.instanceId === threadId);
			if (!record) {
				return new Response("Run record not available", { status: 404 });
			}
			return Response.json(record);
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

function projectRunRecord(record: SubAgentRunRecord): DashboardThreadState {
	const endTime = record.completedAt ?? (record.status === "running" ? null : record.updatedAt);
	return {
		instanceId: record.instanceId,
		taskId: record.taskId,
		definitionName: record.definitionName,
		parentThreadId: record.parentThreadId,
		parentToolCallId: record.parentToolCallId,
		runId: record.runId,
		runIndex: record.runIndex,
		description: record.description,
		state: mapRunStatusToState(record.status),
		startTime: record.startedAt,
		endTime,
		turnCount: record.turnCount,
		lastActivityAt: record.updatedAt,
		currentTool: null,
		error: record.error ?? null,
		toolCount: record.toolCount,
		currentToolStartedAt: null,
		durationMs: endTime ? endTime - record.startedAt : Date.now() - record.startedAt,
		kind: "subagent",
		isLive: false,
		sessionId: record.sessionId,
		modelProvider: record.modelProvider,
		modelId: record.modelId,
	};
}

function mergeRunRecordIntoThread(thread: DashboardThreadState, record: SubAgentRunRecord): DashboardThreadState {
	const projected = projectRunRecord(record);
	return {
		...projected,
		...thread,
		parentThreadId: thread.parentThreadId ?? projected.parentThreadId,
		parentToolCallId: thread.parentToolCallId ?? projected.parentToolCallId,
		runId: thread.runId ?? projected.runId,
		runIndex: thread.runIndex ?? projected.runIndex,
		description: thread.description ?? projected.description,
		startTime: thread.startTime ?? projected.startTime,
		endTime: thread.endTime ?? projected.endTime,
		lastActivityAt: Math.max(thread.lastActivityAt, projected.lastActivityAt),
		error: thread.error ?? projected.error,
		sessionId: thread.sessionId ?? projected.sessionId,
		modelProvider: thread.modelProvider ?? projected.modelProvider,
		modelId: thread.modelId ?? projected.modelId,
	};
}

function mapRunStatusToState(status: SubAgentRunRecord["status"]): SubAgentState {
	switch (status) {
		case "completed":
			return "completed";
		case "blocked":
			return "blocked";
		case "running":
			return "running";
		case "cancelled":
			return "cancelled";
		case "timed_out":
			return "timed_out";
		default:
			return "failed";
	}
}
