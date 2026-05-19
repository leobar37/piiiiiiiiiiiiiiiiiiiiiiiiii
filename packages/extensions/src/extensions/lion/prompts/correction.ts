import type { LionPlan, LionPlanContent, LionTask } from "../types.js";

export function buildCorrectionPrompt(
	plan: LionPlan,
	task: LionTask,
	content: LionPlanContent,
	previousExecutorSummary: string,
	reviewerFeedback: string,
): string {
	return `Correct task ${task.id} from structured plan ${plan.slug}.

You are the executor sub-agent. The reviewer rejected the previous attempt. Make only the fixes needed to satisfy the review.

## Task Brief

${content.taskBrief}

## Previous Executor Summary

${previousExecutorSummary}

## Reviewer Feedback

${reviewerFeedback}

## Correction Rules

- Fix only the rejected points.
- Do not broaden the task.
- Re-run relevant validation.
- Do not mark checklist state yourself.

## Final Report

Return a concise summary with:
- Files changed
- Fixes made
- Validation run and result
- Remaining risks`;
}
