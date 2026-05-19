import type { LionPlan, LionPlanContent, LionTask } from "../types.js";

export function buildReviewerPrompt(
	plan: LionPlan,
	task: LionTask,
	content: LionPlanContent,
	executorSummary: string,
): string {
	return `Review task ${task.id} from structured plan ${plan.slug}.

You are the reviewer sub-agent. Review the implementation without editing files.

## Plan Context

${content.context}

## Requirements

${content.requirements}

## Task Brief

${content.taskBrief}

## Executor Summary

${executorSummary}

## Review Criteria

- Check the implementation against the task objective and completion criteria.
- Check that scope did not expand beyond the task.
- Check that required validation was run or clearly justified if not run.
- Flag bugs, missing requirements, unsafe changes, and verification gaps.

## Required Output

Start with findings. End with exactly one of these lines:

LION_REVIEW_STATUS: approved
LION_REVIEW_STATUS: rejected`;
}
