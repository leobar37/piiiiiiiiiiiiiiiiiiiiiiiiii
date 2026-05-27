import type { LionPlan } from "../types.js";

export function buildPlanReviewPrompt(plan: LionPlan, focus?: string): string {
	const tasks = plan.tasks
		.map((task) => {
			const deps = task.dependencies.length ? ` deps=${task.dependencies.join(",")}` : "";
			const reqs = task.requirements.length ? ` reqs=${task.requirements.join(",")}` : "";
			return `- ${task.id} [${task.status}] ${task.title} (${task.file})${deps}${reqs}`;
		})
		.join("\n");

	return `Review the active Lion plan as a second opinion. This is a planning quality check.

Plan:
- slug: ${plan.slug}
- kind: ${plan.kind}
- path: ${plan.rootPath}
- context file: ${plan.contextFile ?? "missing"}
- requirements file: ${plan.requirementsFile ?? "missing"}
- index file: ${plan.indexFile}
- checklist file: ${plan.checklistFile ?? "missing"}

${focus ? `Focus: ${focus}\n\n` : ""}Tasks:
${tasks || "(no tasks)"}

Inspect all plan files (context, requirements, task index, checklist, and task briefs).

Check for:
- missing files or empty/missing briefs — create them with reasonable content
- unclear or missing acceptance criteria — add them
- tasks that are too large or too small — split or merge as needed
- unreasonable dependencies — adjust them
- risks not called out — add them to task briefs
- broken checklist state — correct it (e.g., reset stuck tasks to pending)

Fix all issues you find directly in the plan files.

When done, provide a summary of what you found and what you fixed. If you found no issues, say so. If you found issues that require human judgment and cannot be fixed automatically, mention them explicitly.`;
}
