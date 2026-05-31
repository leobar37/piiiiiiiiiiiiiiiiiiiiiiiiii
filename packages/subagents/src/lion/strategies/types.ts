import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { RunTasksParams } from "../task-runner.js";
import type { LionState } from "../types.js";

export type LionTaskConfigInput = NonNullable<RunTasksParams["tasks"]>[number];

export interface LionStrategy {
	name: LionState["strategy"];
	buildMainPrompt(state: LionState): string;
	decorateTaskPrompt(taskConfig: LionTaskConfigInput, context: LionTaskPromptContext): LionTaskConfigInput;
	buildCompactionInstructions(state: LionState, context: LionCompactionContext): Promise<string | null>;
}

export interface LionTaskPromptContext {
	plan: {
		slug: string;
		rootPath: string;
		tasks: Array<{ id: string; title: string; file: string }>;
	} | null;
}

export interface LionCompactionContext {
	ctx: ExtensionContext;
	activeRun: {
		runId: string;
		taskId: string;
		taskTitle: string;
		status: string;
		attempts: number;
		maxAttempts: number;
		verdict: string | null;
		error: string | null;
		subagents: Array<{
			role: string;
			taskId: string;
			status: string;
			summary: string;
		}>;
	} | null;
	recentJobs: Array<{
		role: string;
		taskId: string;
		status: string;
		summary: string;
	}>;
	getSubagentContext(taskId: string): Promise<{ path: string; summary: string }>;
}
