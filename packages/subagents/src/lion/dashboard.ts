import { HttpServerTransport } from "../transport/http-server.js";
import type { LionRuntime } from "./runtime.js";

function isDashboardMode(): boolean {
	return process.env.LION_DASHBOARD_MODE === "true";
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

	constructor(private runtime: LionRuntime) {}

	async start(): Promise<URL> {
		if (isDashboardMode()) {
			return new URL("http://disabled");
		}

		const controller = this.runtime.activeController;
		if (!controller) {
			throw new Error("Lion is not active. Use /lion-activate to start Lion first.");
		}

		this.transport = new HttpServerTransport({
			port: 0,
			host: "127.0.0.1",
			controller,
			mainSession: this.runtime.mainSession,
			lionState: () => this.runtime.state,
		});

		// Wire the transport into the controller's event bus so events flow to the dashboard
		this.unsubscribeBus = controller.getEventBus().subscribe((event) => {
			this.transport?.emit(event);
		});

		await this.transport.start();

		// Replay persisted historical events so SSE clients receive the full event history.
		// transport.start() already calls rehydrate() internally; this explicit call ensures
		// events are fully loaded before replaying them to any connected dashboard client.
		await this.transport.stateManager.rehydrate();
		await this.transport.replayEventsToSse();

		const port = this.transport.port;
		return new URL(`http://127.0.0.1:${port}`);
	}

	async stop(): Promise<void> {
		this.unsubscribeBus?.();
		this.unsubscribeBus = undefined;
		if (this.transport) {
			await this.transport.stop();
			this.transport = null;
		}
	}
}
