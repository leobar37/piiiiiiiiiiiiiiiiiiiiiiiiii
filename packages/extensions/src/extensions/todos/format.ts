import type { Theme } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { fuzzyMatch } from "@earendil-works/pi-tui";
import { formatTaskId, isTaskClosed, normalizeTaskId, validateTaskId } from "./task-store.js";
import type { TaskRecord, TaskStatus } from "./types.js";

export { formatTaskId, normalizeTaskId, validateTaskId };

export function getTaskTitle(task: TaskRecord): string {
	return task.title || "(untitled)";
}

export function getTaskStatus(task: TaskRecord): TaskStatus {
	return task.status || "pending";
}

export function isTaskVisible(task: TaskRecord): boolean {
	return task.status !== "deleted";
}

export function buildTaskSearchText(task: TaskRecord): string {
	const assignment = task.assignedToSession ? `assigned:${task.assignedToSession}` : "";
	const files = task.context?.files?.join(" ") ?? "";
	const doneWhen = task.context?.doneWhen?.join(" ") ?? "";
	return [
		formatTaskId(task.id),
		task.id,
		task.title,
		task.status,
		assignment,
		task.context?.why ?? "",
		files,
		doneWhen,
		task.context?.notes ?? "",
	]
		.join(" ")
		.trim();
}

export function filterTasks(tasks: TaskRecord[], query: string): TaskRecord[] {
	const trimmed = query.trim();
	if (!trimmed) return tasks;
	const tokens = trimmed
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);
	if (tokens.length === 0) return tasks;

	const matches: Array<{ task: TaskRecord; score: number }> = [];
	for (const task of tasks) {
		const text = buildTaskSearchText(task);
		let totalScore = 0;
		let matched = true;
		for (const token of tokens) {
			const result = fuzzyMatch(token, text);
			if (!result.matches) {
				matched = false;
				break;
			}
			totalScore += result.score;
		}
		if (matched) matches.push({ task, score: totalScore });
	}
	return matches.sort((a, b) => a.score - b.score).map((match) => match.task);
}

export function formatAssignmentSuffix(task: TaskRecord): string {
	return task.assignedToSession ? ` (assigned: ${task.assignedToSession})` : "";
}

export function renderAssignmentSuffix(theme: Theme, task: TaskRecord, currentSessionId?: string): string {
	if (!task.assignedToSession) return "";
	const isCurrent = task.assignedToSession === currentSessionId;
	const color = isCurrent ? "success" : "dim";
	const suffix = isCurrent ? ", current" : "";
	return theme.fg(color, ` (assigned: ${task.assignedToSession}${suffix})`);
}

export function formatTaskHeading(task: TaskRecord): string {
	return `${formatTaskId(task.id)} ${getTaskTitle(task)}${formatAssignmentSuffix(task)}`;
}

export function splitTasksByStatus(tasks: TaskRecord[]): {
	activeTasks: TaskRecord[];
	pendingTasks: TaskRecord[];
	blockedTasks: TaskRecord[];
	completedTasks: TaskRecord[];
	deletedTasks: TaskRecord[];
} {
	const activeTasks: TaskRecord[] = [];
	const pendingTasks: TaskRecord[] = [];
	const blockedTasks: TaskRecord[] = [];
	const completedTasks: TaskRecord[] = [];
	const deletedTasks: TaskRecord[] = [];
	for (const task of tasks) {
		if (task.status === "in_progress") activeTasks.push(task);
		else if (task.status === "blocked") blockedTasks.push(task);
		else if (task.status === "completed") completedTasks.push(task);
		else if (task.status === "deleted") deletedTasks.push(task);
		else pendingTasks.push(task);
	}
	return { activeTasks, pendingTasks, blockedTasks, completedTasks, deletedTasks };
}

export function formatTaskList(tasks: TaskRecord[]): string {
	if (!tasks.length) return "No tasks.";
	const { activeTasks, pendingTasks, blockedTasks, completedTasks } = splitTasksByStatus(tasks);
	const lines: string[] = [];
	const pushSection = (label: string, sectionTasks: TaskRecord[]) => {
		lines.push(`${label} (${sectionTasks.length}):`);
		if (!sectionTasks.length) {
			lines.push("  none");
			return;
		}
		for (const task of sectionTasks) {
			lines.push(`  ${formatTaskHeading(task)}`);
		}
	};
	pushSection("In progress", activeTasks);
	pushSection("Pending", pendingTasks);
	pushSection("Blocked", blockedTasks);
	pushSection("Completed", completedTasks);
	return lines.join("\n");
}

export function serializeTaskForAgent(task: TaskRecord): string {
	return JSON.stringify({ ...task, id: formatTaskId(task.id) }, null, 2);
}

export function serializeTaskListForAgent(tasks: TaskRecord[]): string {
	const { activeTasks, pendingTasks, blockedTasks, completedTasks } = splitTasksByStatus(tasks);
	const mapTask = (task: TaskRecord) => ({ ...task, id: formatTaskId(task.id) });
	return JSON.stringify(
		{
			in_progress: activeTasks.map(mapTask),
			pending: pendingTasks.map(mapTask),
			blocked: blockedTasks.map(mapTask),
			completed: completedTasks.map(mapTask),
		},
		null,
		2,
	);
}

export function renderTaskHeading(theme: Theme, task: TaskRecord, currentSessionId?: string): string {
	const closed = isTaskClosed(task.status);
	const titleColor = closed ? "dim" : "text";
	const assignmentText = renderAssignmentSuffix(theme, task, currentSessionId);
	return `${theme.fg("accent", formatTaskId(task.id))} ${theme.fg(titleColor, getTaskTitle(task))}${assignmentText}`;
}

export function renderTaskList(
	theme: Theme,
	tasks: TaskRecord[],
	expanded: boolean,
	currentSessionId?: string,
): string {
	if (!tasks.length) return theme.fg("dim", "No tasks");
	const { activeTasks, pendingTasks, blockedTasks, completedTasks } = splitTasksByStatus(tasks);
	const sections: Array<{ label: string; tasks: TaskRecord[] }> = [
		{ label: "In progress", tasks: activeTasks },
		{ label: "Pending", tasks: pendingTasks },
		{ label: "Blocked", tasks: blockedTasks },
		{ label: "Completed", tasks: completedTasks },
	];
	const lines: string[] = [];
	sections.forEach((section, index) => {
		if (index > 0) lines.push("");
		lines.push(theme.fg("muted", `${section.label} (${section.tasks.length})`));
		if (!section.tasks.length) {
			lines.push(theme.fg("dim", "  none"));
			return;
		}
		const maxItems = expanded ? section.tasks.length : Math.min(section.tasks.length, 3);
		for (let i = 0; i < maxItems; i += 1) {
			lines.push(`  ${renderTaskHeading(theme, section.tasks[i], currentSessionId)}`);
		}
		if (!expanded && section.tasks.length > maxItems) {
			lines.push(theme.fg("dim", `  ... ${section.tasks.length - maxItems} more`));
		}
	});
	return lines.join("\n");
}

export function renderTaskDetail(theme: Theme, task: TaskRecord, expanded: boolean): string {
	const summary = renderTaskHeading(theme, task);
	if (!expanded) return summary;
	const lines = [
		summary,
		theme.fg("muted", `Status: ${getTaskStatus(task)}`),
		theme.fg("muted", `Revision: ${task.revision}`),
		theme.fg("muted", `Created: ${task.createdAt}`),
		theme.fg("muted", `Updated: ${task.updatedAt}`),
		"",
		theme.fg("muted", "Context:"),
		...formatContextLines(task).map((line) => theme.fg("text", `  ${line}`)),
	];
	return lines.join("\n");
}

export function formatContextMarkdown(task: TaskRecord): string {
	const lines = formatContextLines(task);
	return lines.length ? lines.join("\n") : "_No task context yet._";
}

export function appendExpandHint(theme: Theme, text: string): string {
	return `${text}\n${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`;
}

function formatContextLines(task: TaskRecord): string[] {
	const context = task.context;
	if (!context) return [];
	const lines: string[] = [];
	if (context.why) lines.push(`Why: ${context.why}`);
	if (context.files?.length) {
		lines.push("Files:");
		lines.push(...context.files.map((file) => `- ${file}`));
	}
	if (context.doneWhen?.length) {
		lines.push("Done when:");
		lines.push(...context.doneWhen.map((item) => `- ${item}`));
	}
	if (context.notes) {
		lines.push("Notes:");
		lines.push(context.notes);
	}
	return lines;
}
