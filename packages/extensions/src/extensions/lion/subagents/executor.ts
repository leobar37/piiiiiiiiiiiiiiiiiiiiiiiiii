import type { DelegationResult, DelegationTask, SubAgentController } from "@local/pi-subagents";
import type { LionDelegationRunResult, LionEventSink, LionPlan, LionTask } from "../types.js";

export async function runExecutorDelegation(options: {
	controller: SubAgentController;
	runId: string;
	plan: LionPlan;
	task: LionTask;
	attempt: number;
	prompt: string;
	emit: LionEventSink;
}): Promise<LionDelegationRunResult> {
	const taskId = `${options.task.id}-executor-${options.attempt}`;
	const task: DelegationTask = {
		id: taskId,
		definition: "executor",
		description: `Implement ${options.task.id}: ${options.task.title}`,
		prompt: options.prompt,
		systemPromptMode: "append",
	};
	options.emit({
		type: "lion.delegation.start",
		timestamp: Date.now(),
		runId: options.runId,
		planSlug: options.plan.slug,
		planPath: options.plan.rootPath,
		taskId: options.task.id,
		attempt: options.attempt,
		agent: "executor",
	});
	const result: DelegationResult = await options.controller.executeTask(task);
	options.emit({
		type: "lion.delegation.end",
		timestamp: Date.now(),
		runId: options.runId,
		planSlug: options.plan.slug,
		planPath: options.plan.rootPath,
		taskId: options.task.id,
		attempt: options.attempt,
		agent: "executor",
		status: result.status,
		summary: result.summary,
	});
	return { result, summary: result.summary, status: result.status };
}
