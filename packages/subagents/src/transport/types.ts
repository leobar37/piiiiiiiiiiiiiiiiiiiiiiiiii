import type { SubAgentEvent } from "../types.js";

export interface SubAgentTransport {
	readonly id: string;
	start(): Promise<void>;
	stop(): Promise<void>;
	emit(event: SubAgentTransportEvent): void;
}

export type SubAgentTransportEvent = SubAgentEvent;
