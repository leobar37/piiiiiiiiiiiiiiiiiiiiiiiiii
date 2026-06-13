/**
 * DashboardDaemon — minimal HTTP server for the web dashboard SPA.
 *
 * Serves the static React SPA. Session runtime is handled by the subagents
 * backend spawned by Electron's main process.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { logger } from "../logging.js";
import { createDashboardRouter } from "../procedures/index.js";
import type { DashboardConfig } from "../types.js";
import { serveStaticFile } from "./static.js";

function resolveDefaultFrontendDir(moduleDir: string): string {
	const candidates = [join(moduleDir, "..", "..", "frontend", "dist"), join(moduleDir, "..", "frontend", "dist")];
	return candidates.find((candidate) => existsSync(join(candidate, "index.html"))) ?? candidates[0];
}

export class DashboardDaemon {
	private handler: RPCHandler<Record<string, unknown>> | null = null;
	private server: ReturnType<typeof Bun.serve> | null = null;
	private config: Required<DashboardConfig>;
	private startTime = 0;

	constructor(config?: DashboardConfig) {
		const __dirname = dirname(fileURLToPath(import.meta.url));
		this.config = {
			host: config?.host ?? "127.0.0.1",
			port: config?.port ?? 9393,
			frontendDir: config?.frontendDir ?? resolveDefaultFrontendDir(__dirname),
			dev: config?.dev ?? false,
		};
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
		const router = createDashboardRouter(() => this.startTime);
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

				// API routes -> oRPC handler
				if (url.pathname.startsWith("/api")) {
					const { matched, response } = await this.handler!.handle(req, {
						prefix: "/api",
						context: {},
					});
					if (matched) {
						return response;
					}
				}

				// Static files -> frontend dist
				return serveStaticFile(url.pathname, this.config.frontendDir);
			},
		});

		return this.url!;
	}

	async stop(): Promise<void> {
		if (!this.server) return;

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
