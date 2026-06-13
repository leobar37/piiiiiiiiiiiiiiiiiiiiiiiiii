import { HttpServerTransport } from "../transport/http-server.js";
import type { LionRuntime } from "./runtime.js";

function isDashboardMode(): boolean {
	return process.env.LION_DASHBOARD_MODE === "true";
}

function getDashboardPort(): number {
	const rawPort = process.env.PI_SUBAGENTS_DASHBOARD_PORT;
	if (!rawPort) return 0;

	const port = Number(rawPort);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		throw new Error(`Invalid PI_SUBAGENTS_DASHBOARD_PORT: ${rawPort}`);
	}
	return port;
}

export interface LionDashboard {
	start(): Promise<URL>;
	stop(): Promise<void>;
}

export function getOrStartLionDashboard(runtime: LionRuntime): LionDashboard {
	if (!runtime.dashboard) {
		runtime.dashboard = new LionDashboardServer(runtime);
	}
	return runtime.dashboard;
}

/**
 * Lion dashboard server.
 *
 * Environment:
 * - `LION_DASHBOARD_MODE=true` — disables the standalone frontend UI.
 *   Used when Lion is embedded in the web dashboard.
 */
class LionDashboardServer implements LionDashboard {
	private transport: HttpServerTransport | null = null;
	private unsubscribeBus?: () => void;
	private unsubscribeLionBus?: () => void;

	constructor(private runtime: LionRuntime) {}

	async start(): Promise<URL> {
		if (isDashboardMode()) {
			return new URL("http://disabled");
		}

		const ctx = this.runtime.lastUiContext;
		const controller = this.runtime.activeController ?? (ctx ? this.runtime.ensureController(ctx) : null);
		if (!controller) throw new Error("Dashboard is not attached to a Pi session yet.");

		this.transport = new HttpServerTransport({
			port: getDashboardPort(),
			host: "127.0.0.1",
			controller,
			mainSession: this.runtime.mainSession,
			lionState: () => this.runtime.state,
			setLionStrategy: async (strategy) => this.runtime.setStrategy(strategy),
		});

		// Wire the transport into the controller's event bus so events flow to the dashboard
		this.unsubscribeBus = controller.getEventBus().subscribe((event) => {
			this.transport?.emit(event);
		});
		this.unsubscribeLionBus = this.runtime.events.on("*", (event) => {
			this.transport?.emit(event);
		});

		await this.transport.start();

		// Replay currently tracked live-process events to any connected dashboard client.
		await this.transport.replayEventsToSse();

		const port = this.transport.port;
		return new URL(`http://127.0.0.1:${port}`);
	}

	async stop(): Promise<void> {
		this.unsubscribeBus?.();
		this.unsubscribeBus = undefined;
		this.unsubscribeLionBus?.();
		this.unsubscribeLionBus = undefined;
		if (this.transport) {
			await this.transport.stop();
			this.transport = null;
		}
	}
}
