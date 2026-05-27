import { HttpServerTransport } from "@local/pi-subagents";
import type { LionRuntime } from "./runtime.js";

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

class LionDashboardServer implements LionDashboard {
	private transport: HttpServerTransport | null = null;
	private unsubscribeBus?: () => void;

	constructor(private runtime: LionRuntime) {}

	async start(): Promise<URL> {
		const controller = this.runtime.activeController;
		if (!controller) {
			throw new Error("No active subagent controller. Start a Lion run first (/lion-build or /lion-validate).");
		}

		this.transport = new HttpServerTransport({
			port: 0,
			host: "127.0.0.1",
			controller,
		});

		// Wire the transport into the controller's event bus so events flow to the dashboard
		this.unsubscribeBus = controller.getEventBus().subscribe((event) => {
			this.transport?.emit(event);
		});

		await this.transport.start();

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
