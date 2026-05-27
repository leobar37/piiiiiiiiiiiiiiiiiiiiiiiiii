import type { SubAgentEventBus } from "../event-bus.js";
import type { SubAgentEvent, SubAgentInstanceState } from "../types.js";
import type { SubAgentTransport, SubAgentTransportEvent } from "./types.js";

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
					transport.emit(toTransportEvent(event));
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

function toTransportEvent(event: SubAgentEvent): SubAgentTransportEvent {
	if (event.type === "instance.state") {
		return {
			type: "instance.state",
			instanceId: event.instanceId,
			state: event.state as SubAgentInstanceState,
		};
	}
	return {
		type: event.type,
		instanceId: "instanceId" in event ? (event as any).instanceId : "",
		taskId: "taskId" in event ? (event as any).taskId : "",
		timestamp: "timestamp" in event ? (event as any).timestamp : Date.now(),
	};
}
