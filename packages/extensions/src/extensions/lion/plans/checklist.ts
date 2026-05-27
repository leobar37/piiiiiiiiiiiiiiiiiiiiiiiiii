import { readFileSync, writeFileSync } from "node:fs";
import type { LionTask } from "../types.js";

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
		return record.tasks;
	}

	updateTaskStatus(taskId: string, status: string): void {
		const raw = readFileSync(this.path, "utf-8");
		const record: ChecklistRecord = JSON.parse(raw);
		const task = record.tasks.find((t) => t.id === taskId);
		if (!task) {
			throw new Error(`Task ${taskId} not found in checklist`);
		}
		task.status = status as LionTask["status"];
		record.completed = record.tasks.filter((t) => t.status === "complete").length;
		record.total_tasks = record.tasks.length;
		writeFileSync(this.path, JSON.stringify(record, null, 2), "utf-8");
	}
}
