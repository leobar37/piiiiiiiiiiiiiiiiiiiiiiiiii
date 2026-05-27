import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LionPlan, LionPlanContent, LionTask } from "../types.js";
import { LionChecklistFile } from "./checklist.js";

interface StructuredPlan {
	kind: "structured";
	slug: string;
	rootPath: string;
	indexFile: string;
	contextFile: string;
	tasks: LionPlan["tasks"];
}

export class StructuredLionPlanFile {
	constructor(private rootPath: string) {}

	loadPlan(): StructuredPlan {
		const cwd = resolve(this.rootPath);
		const contextFile = join(cwd, "context.md");
		const requirementsFile = join(cwd, "requirements.md");
		const taskIndexFile = join(cwd, "task-index.md");
		const checklistFile = join(cwd, "checklist.json");

		if (!existsSync(contextFile)) {
			throw new Error(`Required plan file missing: context.md in ${cwd}`);
		}
		if (!existsSync(requirementsFile)) {
			throw new Error(`Required plan file missing: requirements.md in ${cwd}`);
		}
		if (!existsSync(taskIndexFile)) {
			throw new Error(`Required plan file missing: task-index.md in ${cwd}`);
		}

		const tasks: LionPlan["tasks"] = [];

		if (existsSync(checklistFile)) {
			const checklist = new LionChecklistFile(checklistFile);
			tasks.push(...checklist.loadTasks());
		}

		return {
			kind: "structured",
			slug: "plan",
			rootPath: cwd,
			indexFile: taskIndexFile,
			contextFile,
			tasks,
		};
	}

	readContent(plan: StructuredPlan, _task: LionTask): LionPlanContent {
		return {
			context: readFileSync(plan.contextFile, "utf-8"),
			requirements: readFileSync(join(plan.rootPath, "requirements.md"), "utf-8"),
			taskIndex: readFileSync(plan.indexFile, "utf-8"),
			taskBrief: "",
		};
	}

	markTaskComplete(plan: StructuredPlan, taskId: string): void {
		const checklistFile = join(plan.rootPath, "checklist.json");
		if (existsSync(checklistFile)) {
			const checklist = new LionChecklistFile(checklistFile);
			checklist.updateTaskStatus(taskId, "complete");
		}
	}
}
