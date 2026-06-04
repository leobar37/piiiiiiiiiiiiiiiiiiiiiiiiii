import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LionPlan, LionTask, LionTaskStatus } from "../types.js";
import { LionChecklistFile } from "./checklist.js";
import { StructuredLionPlanFile } from "./structured.js";

export interface PlanResolution {
	status: "resolved" | "ambiguous" | "not_found";
	planPath: string;
	candidates: Array<{
		slug: string;
		path: string;
		displayPath: string;
		kind: string;
		reason: string;
	}>;
}

export function loadLionPlan(planPath: string): LionPlan {
	if (!existsSync(planPath)) {
		throw new Error(`Plan file not found: ${planPath}`);
	}

	const stats = statSync(planPath);
	if (stats.isDirectory()) {
		return new StructuredLionPlanFile(planPath).loadPlan();
	}
	if (planPath.endsWith("task-index.md")) {
		return new StructuredLionPlanFile(resolve(planPath, "..")).loadPlan();
	}

	const content = readFileSync(planPath, "utf-8");
	const lines = content.split("\n");

	// Simple parsing: first line as slug, rest as tasks
	const slug = lines[0]?.trim() || "unknown";
	const tasks: LionTask[] = [];

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		const parts = line.split("|");
		tasks.push({
			id: `task-${i}`,
			title: parts[0] || line,
			file: parts[1] || "",
			status: "pending",
			dependencies: parts[2]
				? parts[2]
						.split(",")
						.map((d) => d.trim())
						.filter(Boolean)
				: [],
			requirements: [],
		});
	}

	return {
		kind: "structured",
		slug,
		rootPath: planPath,
		indexFile: planPath,
		tasks,
	};
}

export function resolvePlanPath(cwd: string, input: string): string | null {
	// Try direct path first
	const direct = resolve(cwd, input);
	if (existsSync(direct)) return direct;

	// Try with .md extension
	const withExt = resolve(cwd, `${input}.md`);
	if (existsSync(withExt)) return withExt;

	// Try in plans directory
	const inPlans = resolve(cwd, "plans", input);
	if (existsSync(inPlans)) return inPlans;

	const inPlansExt = resolve(cwd, "plans", `${input}.md`);
	if (existsSync(inPlansExt)) return inPlansExt;

	const inDotPlans = resolve(cwd, ".plans", input);
	if (existsSync(inDotPlans)) return inDotPlans;

	const inDotPlansExt = resolve(cwd, ".plans", `${input}.md`);
	if (existsSync(inDotPlansExt)) return inDotPlansExt;

	return null;
}

export function resolvePlanReference(cwd: string, reference: string): PlanResolution {
	const planPath = resolvePlanPath(cwd, reference);
	if (planPath) {
		return {
			status: "resolved",
			planPath,
			candidates: [],
		};
	}

	// Search for candidate plans
	const candidates = findCandidatePlans(cwd, reference);
	if (candidates.length === 1) {
		return {
			status: "resolved",
			planPath: candidates[0].path,
			candidates: [],
		};
	}

	if (candidates.length > 1) {
		return {
			status: "ambiguous",
			planPath: "",
			candidates,
		};
	}

	return {
		status: "not_found",
		planPath: "",
		candidates: [],
	};
}

function findCandidatePlans(cwd: string, _reference: string): PlanResolution["candidates"] {
	const candidates: PlanResolution["candidates"] = [];
	const plansDir = join(cwd, "plans");

	if (!existsSync(plansDir)) {
		return candidates;
	}

	// Simple matching: check if reference is substring of filename
	// In real implementation, this would scan directory
	return candidates;
}

export interface ListedPlan {
	slug: string;
	path: string;
	displayPath: string;
	taskCount: number;
	modifiedAt: number;
}

/**
 * List all available plans in the project.
 * Scans `plans/` and `.plans/` directories for markdown files.
 */
export function listPlans(cwd: string): ListedPlan[] {
	const plans: ListedPlan[] = [];
	const seenPaths = new Set<string>();

	for (const dirName of ["plans", ".plans"]) {
		const dir = join(cwd, dirName);
		if (!existsSync(dir)) continue;

		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (seenPaths.has(path)) continue;

			if (entry.isFile() && entry.name.endsWith(".md")) {
				seenPaths.add(path);
				try {
					const content = readFileSync(path, "utf-8");
					const lines = content.split("\n");
					const slug = lines[0]?.trim() || entry.name.replace(".md", "");
					const taskCount = lines.filter((l) => l.trim() && !l.startsWith("#")).length - 1;
					const stats = statSync(path);
					plans.push({
						slug,
						path,
						displayPath: path.replace(`${cwd}/`, ""),
						taskCount: Math.max(0, taskCount),
						modifiedAt: stats.mtime.getTime(),
					});
				} catch {
					/* skip unreadable */
				}
			} else if (entry.isDirectory()) {
				// Check for task-index.md inside subdirectories
				const indexPath = join(path, "task-index.md");
				if (existsSync(indexPath)) {
					seenPaths.add(indexPath);
					try {
						const content = readFileSync(indexPath, "utf-8");
						const lines = content.split("\n");
						const slug = lines[0]?.trim() || entry.name;
						const taskCount = lines.filter((l) => l.trim() && !l.startsWith("#")).length - 1;
						const stats = statSync(indexPath);
						plans.push({
							slug,
							path: indexPath,
							displayPath: indexPath.replace(`${cwd}/`, ""),
							taskCount: Math.max(0, taskCount),
							modifiedAt: stats.mtime.getTime(),
						});
					} catch {
						/* skip unreadable */
					}
				}
			}
		}
	}

	// Sort by most recently modified first
	plans.sort((a, b) => b.modifiedAt - a.modifiedAt);
	return plans;
}

export function updateStructuredTaskStatus(plan: LionPlan, taskId: string, status: LionTaskStatus): void {
	const task = plan.tasks.find((t) => t.id === taskId);
	if (task) {
		task.status = status;
	}
	if (plan.checklistFile && existsSync(plan.checklistFile)) {
		new LionChecklistFile(plan.checklistFile).updateTaskStatus(taskId, status);
		return;
	}
	const checklistFile = join(plan.rootPath, "checklist.json");
	if (existsSync(checklistFile)) {
		new LionChecklistFile(checklistFile).updateTaskStatus(taskId, status);
	}
}

export function recordStructuredTaskResult(
	plan: LionPlan,
	taskId: string,
	status: LionTaskStatus,
	summary?: string,
): void {
	const task = plan.tasks.find((t) => t.id === taskId);
	if (task) task.status = status;
	const checklistFile = plan.checklistFile ?? join(plan.rootPath, "checklist.json");
	if (existsSync(checklistFile)) {
		new LionChecklistFile(checklistFile).recordTaskResult(taskId, status, summary);
		return;
	}
	updateStructuredTaskStatus(plan, taskId, status);
}

export function getNextExecutableTask(plan: LionPlan): LionTask | null {
	const complete = new Set(plan.tasks.filter((task) => task.status === "complete").map((task) => task.id));
	return (
		plan.tasks.find((task) => {
			if (task.status !== "pending" && task.status !== "retryable") return false;
			return task.dependencies.every((dependency) => complete.has(dependency));
		}) ?? null
	);
}
