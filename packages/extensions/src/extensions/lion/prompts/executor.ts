import type { LionPlan, LionPlanContent, LionTask } from "../types.js";

export function buildExecutorPrompt(plan: LionPlan, task: LionTask, content: LionPlanContent): string {
	return `Implement task ${task.id} from structured plan ${plan.slug}.

You are the executor sub-agent. Implement only this task. Make minimal, safe changes. Do not broaden scope.

## Plan Context

${content.context}

## Requirements

${content.requirements}

## Task Index

${content.taskIndex}

## Task Brief

${content.taskBrief}

## Execution Rules

- Implement only ${task.id}: ${task.title}.
- Respect dependencies and constraints from the task brief.
- Preserve behavior outside this task's scope.
- Run the validation named by the task when practical.
- Do not mark checklist state yourself.

## Final Report

Return a concise summary with:
- Files changed
- What changed and why
- Validation run and result
- Completion criteria satisfied
- Remaining risks`;
}
