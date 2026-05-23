import { randomUUID } from "node:crypto";
import type { DelegationResult, DelegationTask } from "@local/pi-subagents";
import type { Static } from "typebox";
import type { PlanTaskSchema, RunParams } from "./schemas.js";
import type { RunningSubagentTask, SubagentsRuntime } from "./types.js";

export function toDelegationTask(params: Static<typeof RunParams>): DelegationTask {
	return {
		id: params.id?.trim() || createTaskId("task"),
		definition: params.agent,
		prompt: params.prompt,
		description: params.description,
		systemPrompt: params.systemPrompt,
		systemPromptMode: params.systemPromptMode,
		tools: params.tools,
		disabledTools: params.disabledTools,
		thinkingLevel: params.thinkingLevel,
		maxTurns: params.maxTurns,
		timeout: params.timeout,
	};
}

export function toPlanDelegationTask(params: Static<typeof PlanTaskSchema>): DelegationTask {
	return {
		id: params.id,
		definition: params.agent,
		prompt: params.prompt,
		description: params.description,
		systemPrompt: params.systemPrompt,
		systemPromptMode: params.systemPromptMode,
		tools: params.tools,
		disabledTools: params.disabledTools,
		thinkingLevel: params.thinkingLevel,
		dependsOn: params.dependsOn,
	};
}

export function createTaskId(prefix: string): string {
	return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function rememberTask(
	runtime: SubagentsRuntime,
	id: string,
	promise: Promise<DelegationResult>,
): RunningSubagentTask {
	const running: RunningSubagentTask = {
		id,
		promise,
		startedAt: Date.now(),
	};
	runtime.tasks.set(id, running);
	promise
		.then((result) => {
			running.result = result;
		})
		.catch((error: unknown) => {
			running.error = error instanceof Error ? error.message : String(error);
		});
	return running;
}

export function toPlanResult(taskId: string, results: DelegationResult[]): DelegationResult {
	return {
		taskId,
		agent: "plan",
		status: results.some((result) => result.status === "failed") ? "failed" : "completed",
		summary: JSON.stringify(results, null, 2),
		duration: Math.max(0, ...results.map((result) => result.duration)),
		turnCount: results.reduce((sum, result) => sum + result.turnCount, 0),
		finalState: results[results.length - 1]?.finalState,
	};
}
