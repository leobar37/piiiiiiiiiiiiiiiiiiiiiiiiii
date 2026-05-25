import type { SubAgentController } from "../controller.js";
import type { SubAgentInstanceState } from "../types.js";
import { DASHBOARD_HTML } from "./dashboard-html.js";
import type { SubAgentTransport, SubAgentTransportEvent } from "./types.js";

export interface HttpServerTransportOptions {
	port?: number;
	host?: string;
	controller: SubAgentController;
}

interface SseClient {
	controller: ReadableStreamDefaultController<string>;
	instanceId?: string;
}

export class HttpServerTransport implements SubAgentTransport {
	readonly id = "http-server";
	private server: ReturnType<typeof Bun.serve> | null = null;
	private clients = new Set<SseClient>();
	private instanceStates = new Map<string, SubAgentInstanceState>();

	constructor(private options: HttpServerTransportOptions) {}

	get port(): number {
		return this.server?.port ?? 0;
	}

	async start(): Promise<void> {
		this.server = Bun.serve({
			port: this.options.port ?? 0,
			hostname: this.options.host ?? "0.0.0.0",
			fetch: (req) => this.handleRequest(req),
		});
	}

	async stop(): Promise<void> {
		for (const client of this.clients) {
			try {
				client.controller.close();
			} catch {
				/* best effort */
			}
		}
		this.clients.clear();
		this.server?.stop(true);
		this.server = null;
	}

	emit(event: SubAgentTransportEvent): void {
		if (event.type === "instance.state") {
			this.instanceStates.set(event.instanceId, event.state);
		}

		const payload = `data: ${JSON.stringify(event)}\n\n`;
		for (const client of this.clients) {
			if (client.instanceId && client.instanceId !== event.instanceId) {
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

	private handleRequest(req: Request): Response {
		const url = new URL(req.url);
		const pathname = url.pathname;

		if (req.method === "GET" && pathname === "/") {
			return this.serveDashboard();
		}

		if (req.method === "GET" && pathname === "/api/instances") {
			return this.serveInstances();
		}

		if (req.method === "GET" && pathname.startsWith("/api/instances/")) {
			const rest = pathname.slice("/api/instances/".length);
			const segments = rest.split("/");
			const instanceId = decodeURIComponent(segments[0]);

			if (segments.length === 1) {
				return this.serveInstance(instanceId);
			}
			if (segments.length === 2 && segments[1] === "session") {
				return this.serveSession(instanceId);
			}
		}

		if (req.method === "GET" && pathname === "/events") {
			return this.serveEvents(req, url);
		}

		return new Response("Not Found", { status: 404 });
	}

	private serveDashboard(): Response {
		return new Response(DASHBOARD_HTML, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}

	private serveInstances(): Response {
		const controllerStates = this.options.controller.getInstanceStates();
		for (const state of controllerStates) {
			this.instanceStates.set(state.instanceId, state);
		}
		const states = Array.from(this.instanceStates.values());
		return Response.json(states);
	}

	private serveInstance(instanceId: string): Response {
		const state = this.instanceStates.get(instanceId);
		if (!state) {
			return new Response("Not Found", { status: 404 });
		}
		return Response.json(state);
	}

	private serveSession(instanceId: string): Response {
		const instance = this.options.controller.getInstanceById(instanceId);
		if (!instance) {
			return new Response("Not Found", { status: 404 });
		}
		const rpcState = instance.getRpcState();
		const messages = instance.getMessages();
		return Response.json({
			sessionId: rpcState.sessionId,
			messages,
		});
	}

	private serveEvents(req: Request, url: URL): Response {
		const instanceId = url.searchParams.get("instanceId") ?? undefined;

		const stream = new ReadableStream<string>({
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
			},
		});
	}
}
