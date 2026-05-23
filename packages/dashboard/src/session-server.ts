import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";

export interface SessionServerConfig {
	port: number;
	host: string;
	sessionsDir?: string;
}

export interface SessionServer {
	start(): Promise<void>;
	stop(): void;
	get url(): string;
}

export function createSessionServer(config: SessionServerConfig): SessionServer {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const frontendDir = join(__dirname, "..", "frontend", "dist");

	let server: ReturnType<typeof Bun.serve> | null = null;

	async function listSessions(): Promise<SessionInfo[]> {
		// List sessions from default location or custom directory
		const sessions = await SessionManager.list(process.cwd(), config.sessionsDir);
		return sessions;
	}

	function _getSessionFile(_sessionId: string): string | null {
		// Find session file by ID prefix
		// This is a simplified version - in production would search properly
		return null;
	}

	return {
		async start() {
			server = Bun.serve({
				hostname: config.host,
				port: config.port,
				fetch: async (req: Request) => {
					const url = new URL(req.url);
					const headers = new Headers({
						"Access-Control-Allow-Origin": "*",
						"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
						"Access-Control-Allow-Headers": "Content-Type",
					});

					if (req.method === "OPTIONS") {
						return new Response(null, { headers });
					}

					// API routes
					if (url.pathname.startsWith("/api")) {
						return handleApiRequest(req, url, headers);
					}

					// Static files
					return serveStaticFile(url.pathname, frontendDir, headers);
				},
			});
		},

		stop() {
			if (server) {
				server.stop(true);
				server = null;
			}
		},

		get url(): string {
			if (!server) return "";
			return `http://${config.host}:${server.port}`;
		},
	};

	async function handleApiRequest(req: Request, url: URL, headers: Headers): Promise<Response> {
		// GET /api/sessions - List all sessions
		if (url.pathname === "/api/sessions" && req.method === "GET") {
			try {
				const sessions = await listSessions();
				return Response.json({ sessions }, { headers });
			} catch (_error) {
				return Response.json({ error: "Failed to list sessions" }, { status: 500, headers });
			}
		}

		// POST /api/sessions - Create new session
		if (url.pathname === "/api/sessions" && req.method === "POST") {
			try {
				const body = await req.json();
				const cwd = body.cwd ?? process.cwd();
				const sessionManager = SessionManager.create(cwd, config.sessionsDir);

				return Response.json(
					{
						session: {
							id: sessionManager.getSessionId(),
							file: sessionManager.getSessionFile(),
							cwd: sessionManager.getCwd(),
						},
					},
					{ headers },
				);
			} catch (_error) {
				return Response.json({ error: "Failed to create session" }, { status: 500, headers });
			}
		}

		// GET /api/sessions/:id - Get session info
		const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
		if (sessionMatch && req.method === "GET") {
			const sessionId = sessionMatch[1];
			try {
				// Find session by ID
				const sessions = await listSessions();
				const session = sessions.find((s) => s.id.startsWith(sessionId));

				if (!session) {
					return Response.json({ error: "Session not found" }, { status: 404, headers });
				}

				// Open session to get entries
				const sessionManager = SessionManager.open(session.path);

				return Response.json(
					{
						session: {
							id: session.id,
							name: session.name,
							path: session.path,
							cwd: session.cwd,
							created: session.created,
							modified: session.modified,
							messageCount: session.messageCount,
							entryCount: sessionManager.getEntries().length,
							leafId: sessionManager.getLeafId(),
						},
					},
					{ headers },
				);
			} catch (_error) {
				return Response.json({ error: "Failed to get session" }, { status: 500, headers });
			}
		}

		// GET /api/sessions/:id/entries - Get session entries
		const entriesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/entries$/);
		if (entriesMatch && req.method === "GET") {
			const sessionId = entriesMatch[1];
			try {
				const sessions = await listSessions();
				const session = sessions.find((s) => s.id.startsWith(sessionId));

				if (!session) {
					return Response.json({ error: "Session not found" }, { status: 404, headers });
				}

				const sessionManager = SessionManager.open(session.path);
				const typeFilter = url.searchParams.get("type");
				const customTypeFilter = url.searchParams.get("customType");

				let entries = sessionManager.getEntries();
				if (typeFilter) {
					entries = entries.filter((e) => e.type === typeFilter);
				}
				if (customTypeFilter) {
					entries = entries.filter((e) => e.type === "custom" && (e as any).customType === customTypeFilter);
				}

				return Response.json({ entries }, { headers });
			} catch (_error) {
				return Response.json({ error: "Failed to get entries" }, { status: 500, headers });
			}
		}

		// GET /api/sessions/:id/messages - Get session messages
		const messagesMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
		if (messagesMatch && req.method === "GET") {
			const sessionId = messagesMatch[1];
			try {
				const sessions = await listSessions();
				const session = sessions.find((s) => s.id.startsWith(sessionId));

				if (!session) {
					return Response.json({ error: "Session not found" }, { status: 404, headers });
				}

				const sessionManager = SessionManager.open(session.path);
				const context = sessionManager.buildSessionContext();

				return Response.json(
					{
						messages: context.messages,
						thinkingLevel: context.thinkingLevel,
						model: context.model,
					},
					{ headers },
				);
			} catch (_error) {
				return Response.json({ error: "Failed to get messages" }, { status: 500, headers });
			}
		}

		// POST /api/sessions/:id/prompt - Send prompt to session
		const promptMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/prompt$/);
		if (promptMatch && req.method === "POST") {
			const sessionId = promptMatch[1];
			try {
				const body = await req.json();
				const { message } = body;

				if (!message) {
					return Response.json({ error: "Message is required" }, { status: 400, headers });
				}

				// Note: We can't directly prompt a session from here
				// This would require integration with AgentSession
				// For now, return an error indicating this needs to be implemented
				return Response.json(
					{
						error: "Prompt not yet implemented. Use 'pi' CLI to interact with sessions.",
						sessionId,
						message,
					},
					{ status: 501, headers },
				);
			} catch (_error) {
				return Response.json({ error: "Failed to send prompt" }, { status: 500, headers });
			}
		}

		return Response.json({ error: "Not found" }, { status: 404, headers });
	}
}

function serveStaticFile(pathname: string, frontendDir: string, headers: Headers): Promise<Response> {
	const filePath = pathname === "/" ? "/index.html" : pathname;
	const safePath = filePath.replace(/\.{2,}/g, "").replace(/^\/+/, "");
	const file = Bun.file(join(frontendDir, safePath));

	return file.exists().then((exists) => {
		if (exists) {
			return new Response(file);
		}

		// SPA fallback
		const indexFile = Bun.file(join(frontendDir, "index.html"));
		return indexFile.exists().then((indexExists) => {
			if (indexExists) {
				return new Response(indexFile);
			}
			return new Response("Not Found", { status: 404, headers });
		});
	});
}
