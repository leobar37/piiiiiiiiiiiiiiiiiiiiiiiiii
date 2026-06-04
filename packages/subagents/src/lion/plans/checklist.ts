import { readFileSync, writeFileSync } from "node:fs";
import type { LionTask, LionTaskStatus } from "../types.js";

interface ChecklistRecord {
	completed: number;
	total_tasks: number;
	tasks: Array<LionTask & { title: string }>;
}

export class LionChecklistFile {
	constructor(private path: string) {}

	loadTasks(): LionTask[] {
		const raw = readFileSync(this.path, "utf-8");
		const record: ChecklistRecord = JSON.parse(raw);
		if (!Array.isArray(record.tasks)) {
			throw new Error("Invalid checklist: tasks must be an array");
		}
		const validStatuses = new Set<LionTask["status"]>(["pending", "in_progress", "complete", "blocked", "retryable"]);
		return record.tasks.map((t) => ({
			...t,
			title: t.title ?? (t as any).name ?? "",
			dependencies: Array.isArray(t.dependencies)
				? t.dependencies.filter((d): d is string => typeof d === "string")
				: [],
			requirements: Array.isArray(t.requirements)
				? t.requirements.filter((r): r is string => typeof r === "string")
				: [],
			status:
				(t.status as string) === "running"
					? "in_progress"
					: validStatuses.has(t.status as LionTask["status"])
						? (t.status as LionTask["status"])
						: "pending",
		}));
	}

	updateTaskStatus(taskId: string, status: LionTaskStatus): void {
		const raw = readFileSync(this.path, "utf-8");
		const record: ChecklistRecord = JSON.parse(raw);
		const task = record.tasks.find((t) => t.id === taskId);
		if (!task) {
			throw new Error(`Task ${taskId} not found in checklist`);
		}
		task.status = status;
		record.completed = record.tasks.filter((t) => t.status === "complete").length;
		record.total_tasks = record.tasks.length;
		writeFileSync(this.path, JSON.stringify(record, null, 2), "utf-8");
	}

	recordTaskResult(taskId: string, status: LionTaskStatus, summary?: string): void {
		const raw = readFileSync(this.path, "utf-8");
		const record: ChecklistRecord = JSON.parse(raw);
		const task = record.tasks.find((t) => t.id === taskId);
		if (!task) {
			throw new Error(`Task ${taskId} not found in checklist`);
		}
		const nextTask = task as LionTask & { last_summary?: string; updated_at?: string };
		nextTask.status = status;
		if (summary) nextTask.last_summary = summary;
		nextTask.updated_at = new Date().toISOString();
		record.completed = record.tasks.filter((t) => t.status === "complete").length;
		record.total_tasks = record.tasks.length;
		writeFileSync(this.path, JSON.stringify(record, null, 2), "utf-8");
	}
}
