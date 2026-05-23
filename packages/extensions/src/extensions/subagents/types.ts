import type { DelegationResult, SubAgentController, SubAgentEvent } from "@local/pi-subagents";

export interface RunningSubagentTask {
	id: string;
	promise: Promise<DelegationResult>;
	result?: DelegationResult;
	error?: string;
	startedAt: number;
}

export interface SubagentsRuntime {
	controller?: SubAgentController;
	cwd?: string;
	tasks: Map<string, RunningSubagentTask>;
	events: SubAgentEvent[];
}
