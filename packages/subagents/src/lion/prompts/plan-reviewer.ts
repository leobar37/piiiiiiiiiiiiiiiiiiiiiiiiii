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
- missing files or empty/missing briefs
- unclear or missing acceptance criteria
- tasks that are too large or too small
- unreasonable dependencies
- risks not called out
- broken checklist state, including stuck in-progress tasks

Do not edit files. Provide a concise validation report with findings, severity, affected files/tasks, and recommended plan changes. If you found no issues, say so.`;
}
