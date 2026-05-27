import type { SubAgentEvent, SubAgentInstanceState } from "../types.js";

export interface SubAgentTransport {
	readonly id: string;
	start(): Promise<void>;
	stop(): Promise<void>;
	emit(event: SubAgentTransportEvent): void;
}

export type SubAgentTransportEvent =
	| {
			type: "instance.state";
			instanceId: string;
			state: SubAgentInstanceState;
	  }
	| {
			type: Exclude<SubAgentEvent["type"], "instance.state">;
			instanceId: string;
			taskId: string;
			timestamp: number;
	  };
