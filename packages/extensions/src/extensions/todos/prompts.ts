import { formatTaskId } from "./task-store.js";

export function buildRefinePrompt(taskId: string, title: string): string {
	return (
		`let's refine task ${formatTaskId(taskId)} "${title}": ` +
		"Ask me for the missing details needed to refine the task together. Do not rewrite the task yet and do not make assumptions. " +
		"Ask clear, concrete questions and wait for my answers before drafting a compact task context.\n\n"
	);
}
