import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { getNextExecutableTask, loadLionPlan, resolvePlanPath } from "./plans/index.js";
import { listReviewPlans, loadReviewPlan } from "./review-plan.js";
import type {
	LionChecklistKind,
	LionChecklistProgress,
	LionChecklistSnapshot,
	LionTask,
	LionTaskStatus,
} from "./types.js";

interface ChecklistRecord {
	version?: number;
	review?: string;
	completed: number;
	total_tasks: number;
	tasks: LionTask[];
}

export interface ChecklistReference {
	kind: LionChecklistKind;
	reference?: string;
	activePlanPath?: string | null;
	cwd: string;
}

export interface ChecklistTaskResult {
	checklist: LionChecklistSnapshot;
	task: LionTask | null;
}

export class LionChecklistService {
	read(input: ChecklistReference): LionChecklistSnapshot {
		const resolved = this.resolve(input);
		return this.snapshot(resolved.kind, resolved.rootPath, resolved.slug, resolved.checklistFile);
	}

	startNext(input: ChecklistReference): ChecklistTaskResult {
		const resolved = this.resolve(input);
		const snapshot = this.snapshot(resolved.kind, resolved.rootPath, resolved.slug, resolved.checklistFile);
		const task =
			resolved.kind === "plan"
				? getNextExecutableTask({
						kind: "structured",
						slug: resolved.slug,
						rootPath: resolved.rootPath,
						indexFile: "",
						checklistFile: resolved.checklistFile,
						tasks: snapshot.tasks,
					})
				: (snapshot.tasks.find((item) => item.status === "pending") ?? null);
		if (!task) return { checklist: snapshot, task: null };
		const updatedTask = this.updateTask(resolved.checklistFile, task.id, "in_progress");
		const checklist = this.snapshot(resolved.kind, resolved.rootPath, resolved.slug, resolved.checklistFile);
		return { checklist, task: checklist.tasks.find((item) => item.id === updatedTask.id) ?? updatedTask };
	}

	recordResult(
		input: ChecklistReference & { taskId: string; status: LionTaskStatus; summary?: string },
	): ChecklistTaskResult {
		const resolved = this.resolve(input);
		const task = this.updateTask(resolved.checklistFile, input.taskId, input.status, input.summary);
		const checklist = this.snapshot(resolved.kind, resolved.rootPath, resolved.slug, resolved.checklistFile);
		return { checklist, task: checklist.tasks.find((item) => item.id === task.id) ?? task };
	}

	private resolve(input: ChecklistReference): {
		kind: LionChecklistKind;
		rootPath: string;
		slug: string;
		checklistFile: string;
	} {
		if (input.kind === "plan") {
			const planPath = input.reference ? resolvePlanPath(input.cwd, input.reference) : input.activePlanPath;
			if (!planPath) throw new Error("Plan checklist requires an active plan or reference.");
			const plan = loadLionPlan(planPath);
			const checklistFile = plan.checklistFile ?? join(plan.rootPath, "checklist.json");
			if (!existsSync(checklistFile)) throw new Error(`Plan checklist not found: ${checklistFile}`);
			return { kind: "plan", rootPath: plan.rootPath, slug: plan.slug, checklistFile };
		}

		const reviewReference = input.reference ?? input.activePlanPath;
		if (!reviewReference) throw new Error("Review checklist requires an active review or reference.");
		const review = loadReviewPlan(reviewReference, input.cwd);
		return { kind: "review", rootPath: review.rootPath, slug: review.slug, checklistFile: review.checklistFile };
	}

	private snapshot(
		kind: LionChecklistKind,
		rootPath: string,
		slug: string,
		checklistFile: string,
	): LionChecklistSnapshot {
		const record = this.readRecord(checklistFile);
		const tasks = record.tasks.map((task) => normalizeTask(task));
		return {
			kind,
			slug: record.review || slug || basename(rootPath),
			rootPath,
			checklistFile,
			tasks,
			progress: computeProgress(tasks),
			updatedAt: tasks.reduce<string | null>((latest, task) => {
				if (!task.updated_at) return latest;
				return !latest || task.updated_at > latest ? task.updated_at : latest;
			}, null),
		};
	}

	private updateTask(checklistFile: string, taskId: string, status: LionTaskStatus, summary?: string): LionTask {
		const record = this.readRecord(checklistFile);
		const task = record.tasks.find((item) => item.id === taskId);
		if (!task) throw new Error(`Task ${taskId} not found in checklist`);
		task.status = status;
		if (summary) task.last_summary = summary;
		task.updated_at = new Date().toISOString();
		record.completed = record.tasks.filter((item) => item.status === "complete").length;
		record.total_tasks = record.tasks.length;
		writeFileSync(checklistFile, JSON.stringify(record, null, 2), "utf-8");
		return normalizeTask(task);
	}

	private readRecord(checklistFile: string): ChecklistRecord {
		const raw = readFileSync(checklistFile, "utf-8");
		const record = JSON.parse(raw) as ChecklistRecord;
		if (!Array.isArray(record.tasks)) throw new Error(`Invalid checklist tasks: ${checklistFile}`);
		return record;
	}
}

export function listChecklistReferences(cwd: string): Array<{ kind: LionChecklistKind; path: string }> {
	return listReviewPlans(cwd).map((path) => ({ kind: "review", path }));
}

function normalizeTask(task: LionTask): LionTask {
	return {
		...task,
		title: task.title ?? "",
		file: task.file ?? "",
		status: normalizeStatus(task.status),
		dependencies: Array.isArray(task.dependencies)
			? task.dependencies.filter((item) => typeof item === "string")
			: [],
		requirements: Array.isArray(task.requirements)
			? task.requirements.filter((item) => typeof item === "string")
			: [],
	};
}

function normalizeStatus(status: LionTaskStatus | string): LionTaskStatus {
	if (status === "running") return "in_progress";
	if (
		status === "pending" ||
		status === "in_progress" ||
		status === "complete" ||
		status === "blocked" ||
		status === "retryable"
	) {
		return status;
	}
	return "pending";
}

function computeProgress(tasks: LionTask[]): LionChecklistProgress {
	const completed = tasks.filter((task) => task.status === "complete").length;
	const pending = tasks.filter((task) => task.status === "pending").length;
	const inProgress = tasks.filter((task) => task.status === "in_progress").length;
	const blocked = tasks.filter((task) => task.status === "blocked").length;
	const retryable = tasks.filter((task) => task.status === "retryable").length;
	const total = tasks.length;
	return {
		completed,
		total,
		pending,
		inProgress,
		blocked,
		retryable,
		percent: total > 0 ? Math.round((completed / total) * 100) : 0,
	};
}
