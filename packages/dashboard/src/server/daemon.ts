/**
 * DashboardDaemon — HTTP server for the web dashboard.
 *
 * Starts a Bun HTTP server with:
 * - `/api` — oRPC endpoints (state + unified event stream + session API)
 * - `/` — static React SPA frontend (or Vite dev server in dev mode)
 *
 * Usage:
 * ```ts
 * const daemon = new DashboardDaemon();
 * const url = await daemon.start();
 * console.log(`Dashboard at ${url.href}`);
 * daemon.stop();
 * ```
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { createDashboardDb, type DashboardDbHandle } from "../db/client.js";
import { ProjectsRepository } from "../db/repositories/projects-repository.js";
import { SessionsRepository } from "../db/repositories/sessions-repository.js";
import { EventStreamProvider } from "../events/provider.js";
import { logger } from "../logging.js";
import { createDashboardRouter } from "../procedures/index.js";
import { ProjectService } from "../projects/service.js";
import { SessionHost } from "../session/host.js";
import type { DashboardConfig } from "../types.js";
import { serveStaticFile } from "./static.js";

// Lazy import vite to avoid loading it in production
let viteModule: typeof import("vite") | undefined;

async function fileExists(path: string): Promise<boolean> {
	try {
		const f = Bun.file(path);
		// Bun.file().size throws if the file doesn't exist
		await f.size;
		return true;
	} catch {
		return false;
	}
}

function resolveDefaultFrontendDir(baseDir: string): string {
	const candidates = [join(baseDir, "..", "..", "frontend", "dist"), join(baseDir, "..", "frontend", "dist")];
	return candidates.find((candidate) => existsSync(join(candidate, "index.html"))) ?? candidates[0];
}

/** Wait for a URL to be reachable with a timeout. */
async function _waitForServer(url: string, timeoutMs = 30000, intervalMs = 200): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url, { method: "HEAD" });
			if (res.ok || res.status === 404) {
				return;
			}
		} catch {
			// not ready yet
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

export class DashboardDaemon {
	private handler: RPCHandler<any> | null = null;
	private server: ReturnType<typeof Bun.serve> | null = null;
	private config: Required<Omit<DashboardConfig, "dbPath">> & Pick<DashboardConfig, "dbPath">;
	private startTime = 0;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private viteProcess: any | null = null;
	private viteDevUrl = "http://127.0.0.1:5173";
	private viteServer: import("vite").ViteDevServer | null = null;
	readonly eventProvider = new EventStreamProvider();
	readonly sessionHost = new SessionHost();
	readonly dbHandle: DashboardDbHandle;
	readonly projectService: ProjectService;

	constructor(config?: DashboardConfig) {
		const __dirname = dirname(fileURLToPath(import.meta.url));
		this.config = {
			host: config?.host ?? "127.0.0.1",
			port: config?.port ?? 9393,
			frontendDir: config?.frontendDir ?? resolveDefaultFrontendDir(__dirname),
			dev: config?.dev ?? false,
			dbPath: config?.dbPath,
		};
		this.dbHandle = createDashboardDb(config?.dbPath);
		this.projectService = new ProjectService(
			new ProjectsRepository(this.dbHandle.db),
			new SessionsRepository(this.dbHandle.db),
			this.sessionHost,
		);
	}

	/**
	 * Start the HTTP server. Returns the URL where the dashboard is reachable.
	 * If already running, returns the existing URL.
	 */
	async start(port?: number): Promise<URL> {
		if (this.server) {
			return this.url!;
		}

		// Signal to Lion that it runs inside the web dashboard and should not start its own frontend UI.
		process.env.LION_DASHBOARD_MODE = "true";

		this.startTime = Date.now();

		// Wire up event forwarding so agent events reach SSE subscribers
		this.sessionHost.setEventProvider(this.eventProvider);

		// In dev mode, also log to console for visibility
		if (this.config.dev) {
			logger.setConsoleOutput(true);
		}

		// In dev mode, spawn Vite dev server instead of serving static files
		if (this.config.dev) {
			await this._startViteDevServer();
		} else {
			// Ensure frontend is built before serving static files
			await this._ensureFrontendBuild();
		}

		const listenPort = port ?? this.config.port;
		const router = createDashboardRouter(
			this.eventProvider,
			() => this.startTime,
			this.sessionHost,
			this.projectService,
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
			// @ts-expect-error idleTimeout is available in Bun 1.1.26+ but not in types yet
			idleTimeout: 0,
			fetch: async (req: Request) => {
				const url = new URL(req.url);
				const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

				logger.debug(`${req.method} ${url.pathname}`, { requestId });

				// Direct logs endpoint (before oRPC to avoid RPC routing issues)
				if (url.pathname === "/api/logs" && req.method === "GET") {
					const level = url.searchParams.get("level") as any;
					const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
					const sessionId = url.searchParams.get("sessionId") ?? undefined;
					const logs = logger.getLogs({ level, limit, sessionId });
					return new Response(JSON.stringify({ logs, total: logger.size }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}

				// API routes -> oRPC handler
				if (url.pathname.startsWith("/api")) {
					const { matched, response } = await this.handler!.handle(req, {
						prefix: "/api",
						context: {},
					});
					if (matched) {
						const status = response.status;
						if (status >= 500) {
							logger.error(`oRPC returned ${status} for ${req.method} ${url.pathname}`, {
								requestId,
								status,
							});
						} else if (status >= 400) {
							logger.warn(`oRPC returned ${status} for ${req.method} ${url.pathname}`, {
								requestId,
								status,
							});
						} else {
							logger.debug(`oRPC ${status} for ${req.method} ${url.pathname}`, {
								requestId,
								status,
							});
						}
						return response;
					}
				}

				// In dev mode, proxy to Vite dev server
				if (this.config.dev) {
					return this._proxyToVite(req);
				}

				// Static files -> frontend dist
				return serveStaticFile(url.pathname, this.config.frontendDir);
			},
		});

		return this.url!;
	}

	async stop(): Promise<void> {
		if (!this.server) return;

		// Kill Vite dev server if running
		if (this.viteProcess) {
			this._killViteDevServer();
		}
		if (this.viteServer) {
			this.viteServer.close().catch(() => {});
			this.viteServer = null;
		}

		// Clean up event subscribers
		this.eventProvider.clear();

		// Dispose all live sessions
		try {
			await this.sessionHost.dispose();
		} catch (err) {
			logger.error("Error disposing sessions", { error: String(err) });
		}

		// Stop HTTP server
		this.server.stop(true);
		this.server = null;
		this.handler = null;
		this.startTime = 0;
		this.dbHandle.close();
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

	// -------------------------------------------------------------------------
	// Dev mode: Vite dev server
	// -------------------------------------------------------------------------

	private async _startViteDevServer(): Promise<void> {
		const frontendDir = join(this.config.frontendDir, "..");
		const pkgJsonPath = join(frontendDir, "package.json");
		const hasPackageJson = await fileExists(pkgJsonPath);

		if (!hasPackageJson) {
			logger.warn("Frontend package.json not found, cannot start dev server", { frontendDir });
			return;
		}

		logger.info("Starting Vite dev server...", { frontendDir });

		if (!viteModule) {
			viteModule = await import("vite");
		}

		this.viteServer = await viteModule.createServer({
			root: frontendDir,
			server: {
				port: 5173,
				strictPort: false,
				host: "127.0.0.1",
			},
			appType: "spa",
		});

		await this.viteServer.listen();
		const urls = this.viteServer.resolvedUrls;
		this.viteDevUrl = urls?.local?.[0] ?? "http://127.0.0.1:5173";
		logger.info("Vite dev server ready", { url: this.viteDevUrl });
	}

	private _killViteDevServer(): void {
		if (!this.viteProcess) return;

		logger.info("Stopping Vite dev server...");
		try {
			this.viteProcess.kill("SIGTERM");
		} catch {
			// ignore
		}

		// Force kill after 3s if still running
		setTimeout(() => {
			try {
				this.viteProcess?.kill("SIGKILL");
			} catch {
				// ignore
			}
		}, 3000);

		this.viteProcess = null;
	}

	private async _proxyToVite(req: Request): Promise<Response> {
		if (!this.viteServer) {
			return new Response("Vite dev server not running", { status: 502 });
		}

		const url = new URL(req.url);

		try {
			const viteReq = new Request(`${this.viteDevUrl}${url.pathname}${url.search}`, {
				method: req.method,
				headers: req.headers,
				body: req.body,
			});
			return await fetch(viteReq);
		} catch (err) {
			logger.error("Vite proxy error", { path: url.pathname, error: String(err) });
			return new Response(`Vite dev server error: ${err}`, { status: 502 });
		}
	}

	// -------------------------------------------------------------------------
	// Frontend build
	// -------------------------------------------------------------------------

	private async _ensureFrontendBuild(): Promise<void> {
		const indexPath = join(this.config.frontendDir, "index.html");
		const hasBuild = await fileExists(indexPath);

		if (hasBuild) {
			return;
		}

		logger.info("Frontend build not found, building...", { frontendDir: this.config.frontendDir });
		await this._buildFrontend();
	}

	private async _buildFrontend(): Promise<void> {
		const frontendDir = join(this.config.frontendDir, "..");
		const pkgJsonPath = join(frontendDir, "package.json");
		const hasPackageJson = await fileExists(pkgJsonPath);

		if (!hasPackageJson) {
			logger.warn("Frontend package.json not found, skipping build", { frontendDir });
			return;
		}

		logger.info("Building frontend...", { frontendDir });

		if (!viteModule) {
			viteModule = await import("vite");
		}

		await viteModule.build({
			root: frontendDir,
		});

		logger.info("Frontend build complete");
	}
}
