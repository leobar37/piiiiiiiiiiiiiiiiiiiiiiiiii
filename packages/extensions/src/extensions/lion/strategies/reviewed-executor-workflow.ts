import { LionEvents } from "../events/defs.js";
import { buildCorrectionPrompt, buildExecutorPrompt, buildReviewerPrompt } from "../prompts/index.js";
import type { LionBuildResult, LionDelegationRunResult, LionTaskWorkflowOptions } from "../types.js";
import { parseReviewVerdict } from "./review-verdict.js";

async function runExecutorDelegation(options: {
	controller: import("../types.js").LionTaskWorkflowOptions["controller"];
	runId: string;
	plan: import("../types.js").LionPlan;
	task: import("../types.js").LionTask;
	attempt: number;
	prompt: string;
	emit: import("../types.js").LionEventSink;
}): Promise<LionDelegationRunResult> {
	const { controller, runId, plan, task, attempt, prompt, emit } = options;
	const taskId = `${task.id}-executor-${attempt}`;
	const delegationTask: import("@local/pi-subagents").DelegationTask = {
		id: taskId,
		definition: "executor",
		description: `Implement ${task.id}: ${task.title}`,
		prompt,
		systemPromptMode: "append",
	};
	emit({
		type: "lion.delegation.start",
		timestamp: Date.now(),
		runId,
		planSlug: plan.slug,
		planPath: plan.rootPath,
		taskId: task.id,
		attempt,
		agent: "executor",
	});
	const result = await controller.executeTask(delegationTask);
	emit({
		type: "lion.delegation.end",
		timestamp: Date.now(),
		runId,
		planSlug: plan.slug,
		planPath: plan.rootPath,
		taskId: task.id,
		attempt,
		agent: "executor",
		status: result.status,
		summary: result.summary,
	});
	return { result, summary: result.summary, status: result.status };
}

async function runReviewerDelegation(options: {
	controller: import("../types.js").LionTaskWorkflowOptions["controller"];
	runId: string;
	plan: import("../types.js").LionPlan;
	task: import("../types.js").LionTask;
	attempt: number;
	prompt: string;
	emit: import("../types.js").LionEventSink;
}): Promise<LionDelegationRunResult> {
	const { controller, runId, plan, task, attempt, prompt, emit } = options;
	const taskId = `${task.id}-reviewer-${attempt}`;
	const delegationTask: import("@local/pi-subagents").DelegationTask = {
		id: taskId,
		definition: "reviewer",
		description: `Review ${task.id}: ${task.title}`,
		prompt,
		systemPromptMode: "append",
	};
	emit({
		type: "lion.delegation.start",
		timestamp: Date.now(),
		runId,
		planSlug: plan.slug,
		planPath: plan.rootPath,
		taskId: task.id,
		attempt,
		agent: "reviewer",
	});
	const result = await controller.executeTask(delegationTask);
	emit({
		type: "lion.delegation.end",
		timestamp: Date.now(),
		runId,
		planSlug: plan.slug,
		planPath: plan.rootPath,
		taskId: task.id,
		attempt,
		agent: "reviewer",
		status: result.status,
		summary: result.summary,
	});
	return { result, summary: result.summary, status: result.status };
}

export async function runReviewedExecutorWorkflow(options: LionTaskWorkflowOptions): Promise<LionBuildResult> {
	let executorSummary = "";
	let reviewerSummary = "";
	let executorPrompt = buildExecutorPrompt(options.plan, options.task, options.content);
	const bus = options.bus;

	for (let attempt = 1; attempt <= options.config.maxAttempts; attempt++) {
		bus.publish(LionEvents.delegationPromptCreated, {
			runId: options.runId,
			planSlug: options.plan.slug,
			planPath: options.plan.rootPath,
			taskId: options.task.id,
			attempt,
			agent: "executor",
			promptLength: executorPrompt.length,
		});

		const executor = await runExecutor(options, executorPrompt, attempt);

		executorSummary = executor.summary;
		if (executor.status !== "completed") {
			return {
				taskId: options.task.id,
				attempts: attempt,
				status: "failed",
				executorSummary,
				error: `Executor delegation ended with status ${executor.status}.`,
			};
		}

		const reviewerPrompt = buildReviewerPrompt(options.plan, options.task, options.content, executorSummary);
		bus.publish(LionEvents.delegationPromptCreated, {
			runId: options.runId,
			planSlug: options.plan.slug,
			planPath: options.plan.rootPath,
			taskId: options.task.id,
			attempt,
			agent: "reviewer",
			promptLength: reviewerPrompt.length,
		});

		const reviewer = await runReviewer(options, reviewerPrompt, attempt);
		reviewerSummary = reviewer.summary;
		if (reviewer.status !== "completed") {
			return {
				taskId: options.task.id,
				attempts: attempt,
				status: "failed",
				executorSummary,
				reviewerSummary,
				error: `Reviewer delegation ended with status ${reviewer.status}.`,
			};
		}

		const verdict = parseReviewVerdict(reviewerSummary);
		bus.publish(LionEvents.reviewVerdict, {
			runId: options.runId,
			planSlug: options.plan.slug,
			planPath: options.plan.rootPath,
			taskId: options.task.id,
			attempt,
			verdict,
			summary: reviewerSummary,
		});

		if (verdict === "approved") {
			bus.publish(LionEvents.taskApproved, {
				runId: options.runId,
				planSlug: options.plan.slug,
				planPath: options.plan.rootPath,
				taskId: options.task.id,
			});
			return { taskId: options.task.id, attempts: attempt, status: "approved", executorSummary, reviewerSummary };
		}

		if (attempt < options.config.maxAttempts) {
			bus.publish(LionEvents.correctionRequested, {
				runId: options.runId,
				planSlug: options.plan.slug,
				planPath: options.plan.rootPath,
				taskId: options.task.id,
				feedback: reviewerSummary,
			});
			executorPrompt = buildCorrectionPrompt(
				options.plan,
				options.task,
				options.content,
				executorSummary,
				reviewerSummary,
			);
		}
	}

	const result: LionBuildResult = {
		taskId: options.task.id,
		attempts: options.config.maxAttempts,
		status: "rejected",
		executorSummary,
		reviewerSummary,
		error: "Reviewer did not approve within max attempts.",
	};
	bus.publish(LionEvents.taskRejected, {
		runId: options.runId,
		planSlug: options.plan.slug,
		planPath: options.plan.rootPath,
		taskId: options.task.id,
		reason: result.error ?? "Reviewer did not approve within max attempts.",
	});
	return result;
}

function runExecutor(
	options: LionTaskWorkflowOptions,
	prompt: string,
	attempt: number,
): Promise<LionDelegationRunResult> {
	return runExecutorDelegation({
		controller: options.controller,
		emit: (event) => options.bus.emit(event as any),
		runId: options.runId,
		plan: options.plan,
		task: options.task,
		attempt,
		prompt,
	});
}

function runReviewer(
	options: LionTaskWorkflowOptions,
	prompt: string,
	attempt: number,
): Promise<LionDelegationRunResult> {
	return runReviewerDelegation({
		controller: options.controller,
		emit: (event) => options.bus.emit(event as any),
		runId: options.runId,
		plan: options.plan,
		task: options.task,
		attempt,
		prompt,
	});
}
