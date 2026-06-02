import type { LionState } from "../types.js";
import { escapeXml } from "./shared.js";
import type { LionCompactionContext, LionStrategy, LionTaskConfigInput, LionTaskPromptContext } from "./types.js";

export class ReviewLionStrategy implements LionStrategy {
	readonly name = "review" as const;

	buildMainPrompt(state: LionState): string {
		const review = state.activePlanSlug
			? `\nActive review: ${state.activePlanSlug}`
			: "\nNo active review is selected.";
		return `Lion code review mode is active.${review}

You are the review planning and orchestration thread.
Do not implement or edit application code.
Your job is to produce and execute a durable, evidence-backed code review plan under .reviews/.

## Review Planning Strategy

Start broad, then narrow:
- Interpret the user's review prompt and convert it into objective, scope, constraints, and expected production behavior.
- Detect repository environment, package boundaries, relevant scripts, test surfaces, and loaded internal skills.
- Detect dirty work first, then recent commits when the prompt asks for committed work or dirty work is absent.
- Map likely affected flows, related folders, entrypoints, tests, schemas, config, and runtime paths.
- Turn that map into review milestones in the active .reviews checklist.

## Delegation Strategy

In planning phase, use analyzer and planner delegations to map environment, skills, flows, risk areas, and ideal behavior.
In build phase, use reviewer and validator delegations to inspect milestones, report verified bugs, and reject false positives.

Allowed review roles are analyzer, planner, reviewer, and validator.
Executor work is not allowed in review mode.

Every reviewer task must:
- Inspect the relevant diff or files before drawing conclusions.
- Follow callers, guards, tests, config, schemas, and runtime paths enough to disprove likely false positives.
- Classify each issue as verified, inferred risk, or unknown.
- Return findings first with evidence and false-positive checks.

Every validator task must:
- Re-check reported findings against the likely false-positive explanation.
- Confirm whether the finding is verified, downgraded to inferred risk, or rejected.
- Produce an action plan only after validation.

## Review Checklist Loop

Use lion_checklist_read to inspect durable review progress.
Use lion_checklist_start_next with kind "review" to start the next milestone.
Use lion_tasks with the returned lionTasksParams.
Use lion_checklist_record to record complete, blocked, or retryable results with evidence.

Do not edit checklist.json directly.`;
	}

	decorateTaskPrompt(taskConfig: LionTaskConfigInput, context: LionTaskPromptContext): LionTaskConfigInput {
		if (taskConfig.prompt.includes("</lion_context>")) return taskConfig;
		const review = context.plan;
		const lionContext = [
			'<lion_context mode="review">',
			review ? `  <review slug="${escapeXml(review.slug)}" path="${escapeXml(review.rootPath)}" />` : "",
			"  <instructions>",
			"    <must>Treat the active .reviews plan and task file as the source of truth.</must>",
			"    <must>Load and follow the internal code-review skill when available.</must>",
			"    <must>Try to disprove suspected bugs before reporting them.</must>",
			"    <must>Classify findings as verified, inferred risk, or unknown.</must>",
			"    <must_not>Edit files.</must_not>",
			"    <must_not>Use executor behavior in review mode.</must_not>",
			"  </instructions>",
			taskConfig.title ? `  <task title="${escapeXml(taskConfig.title)}" />` : "",
			"</lion_context>",
		]
			.filter(Boolean)
			.join("\n");

		return { ...taskConfig, prompt: `${lionContext}\n\n${taskConfig.prompt}` };
	}

	async buildCompactionInstructions(state: LionState, context: LionCompactionContext): Promise<string | null> {
		const parts = [
			"Lion code review orchestration is active. Preserve review objective, active review plan, checklist state, findings, false-positive checks, validators, blockers, and next review step.",
			`Strategy: ${state.strategy}`,
			`Phase: ${state.phase}`,
			`Active review: ${state.activePlanSlug ?? "none"}`,
			`Active review path: ${state.activePlanPath ?? "none"}`,
			`Active review task: ${state.activeTaskId ?? "none"}`,
			"Completion gate: findings require evidence and false-positive validation before being reported as verified bugs.",
			"Next orchestration step: read the review checklist, start the next review task, delegate read-only reviewers or validators, then record evidence.",
		];

		if (context.activeRun) {
			parts.push(
				[
					"Active review run:",
					`- runId: ${context.activeRun.runId}`,
					`- taskId: ${context.activeRun.taskId}`,
					`- taskTitle: ${context.activeRun.taskTitle}`,
					`- status: ${context.activeRun.status}`,
					`- error: ${context.activeRun.error ?? "none"}`,
				].join("\n"),
			);
		}

		for (const job of context.recentJobs.slice(-6)) {
			const subagentContext = await context.getSubagentContext(job.taskId);
			parts.push(
				[
					`Review subagent ${job.role}:`,
					`- taskId: ${job.taskId}`,
					`- status: ${job.status}`,
					`- structuredResult: ${job.structuredResult}`,
					`- verificationStatus: ${job.verificationStatus}`,
					`- contextPath: ${subagentContext.path}`,
					`- summary: ${job.summary}`,
					`- durableContext:`,
					subagentContext.summary,
				].join("\n"),
			);
		}

		return parts.join("\n\n");
	}
}
