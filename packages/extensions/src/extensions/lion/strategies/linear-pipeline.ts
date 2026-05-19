import { buildCorrectionPrompt, buildExecutorPrompt, buildReviewerPrompt } from "../prompts/index.js";
import type { LionBuildResult, LionPipelineOptions } from "../types.js";
import { parseReviewVerdict } from "./review-verdict.js";

export async function runLinearPipeline(options: LionPipelineOptions): Promise<LionBuildResult> {
	let executorSummary = "";
	let reviewerSummary = "";
	let executorPrompt = buildExecutorPrompt(options.plan, options.task, options.content);

	for (let attempt = 1; attempt <= options.config.maxAttempts; attempt++) {
		options.emit?.({
			type: "lion.delegation.prompt.created",
			timestamp: Date.now(),
			runId: options.runId,
			planSlug: options.plan.slug,
			planPath: options.plan.rootPath,
			taskId: options.task.id,
			attempt,
			agent: "executor",
			promptLength: executorPrompt.length,
		});
		const executor = await options.runner.runExecutor(executorPrompt, attempt);
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
		options.emit?.({
			type: "lion.delegation.prompt.created",
			timestamp: Date.now(),
			runId: options.runId,
			planSlug: options.plan.slug,
			planPath: options.plan.rootPath,
			taskId: options.task.id,
			attempt,
			agent: "reviewer",
			promptLength: reviewerPrompt.length,
		});
		const reviewer = await options.runner.runReviewer(reviewerPrompt, attempt);
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
		options.emit?.({
			type: "lion.review.verdict",
			timestamp: Date.now(),
			runId: options.runId,
			planSlug: options.plan.slug,
			planPath: options.plan.rootPath,
			taskId: options.task.id,
			attempt,
			verdict,
			summary: reviewerSummary,
		});

		if (verdict === "approved") {
			options.emit?.({
				type: "lion.task.approved",
				timestamp: Date.now(),
				runId: options.runId,
				planSlug: options.plan.slug,
				planPath: options.plan.rootPath,
				taskId: options.task.id,
				attempt,
			});
			return { taskId: options.task.id, attempts: attempt, status: "approved", executorSummary, reviewerSummary };
		}

		if (attempt < options.config.maxAttempts) {
			options.emit?.({
				type: "lion.correction.requested",
				timestamp: Date.now(),
				runId: options.runId,
				planSlug: options.plan.slug,
				planPath: options.plan.rootPath,
				taskId: options.task.id,
				attempt,
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
	options.emit?.({
		type: "lion.task.rejected",
		timestamp: Date.now(),
		runId: options.runId,
		planSlug: options.plan.slug,
		planPath: options.plan.rootPath,
		taskId: options.task.id,
		attempt: options.config.maxAttempts,
		reason: result.error ?? "Reviewer did not approve within max attempts.",
	});
	return result;
}
