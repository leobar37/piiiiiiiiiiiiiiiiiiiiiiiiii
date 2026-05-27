import type { SubAgentEventBus } from "../event-bus.js";
import type { SubAgentTransport } from "./types.js";

export class TransportManager {
	private transports: SubAgentTransport[] = [];
	private eventBus: SubAgentEventBus;
	private unsubscribe?: () => void;

	constructor(eventBus: SubAgentEventBus) {
		this.eventBus = eventBus;
	}

	addTransport(transport: SubAgentTransport): void {
		this.transports.push(transport);
	}

	start(): void {
		for (const transport of this.transports) {
			transport.start().catch((err) => {
				console.error(`[TransportManager] Failed to start transport ${transport.id}:`, err);
			});
		}

		this.unsubscribe = this.eventBus.on("*", (event) => {
			for (const transport of this.transports) {
				try {
					transport.emit(event);
				} catch {
					/* best effort */
				}
			}
		});
	}

	async stop(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = undefined;

		for (const transport of this.transports) {
			try {
				await transport.stop();
			} catch {
				/* best effort */
			}
		}
		this.transports = [];
	}
}
