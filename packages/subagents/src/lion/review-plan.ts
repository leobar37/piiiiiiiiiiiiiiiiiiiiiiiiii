import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { getInternalSkillPath } from "../internal-skills.js";
import type { CodeReviewTodo } from "./code-review.js";
import type { RunTasksParams } from "./task-runner.js";

export type ReviewTaskStatus = "pending" | "in_progress" | "complete" | "blocked" | "retryable";

export interface ReviewPlanTask {
	id: string;
	title: string;
	file: string;
	status: ReviewTaskStatus;
	dependencies: string[];
	requirements: string[];
	scope: string[];
	kind: "review" | "analysis";
	last_summary?: string;
	updated_at?: string;
}

export interface ReviewPlan {
	slug: string;
	rootPath: string;
	contextFile: string;
	indexFile: string;
	checklistFile: string;
	tasks: ReviewPlanTask[];
}

interface ReviewChecklist {
	version: 1;
	review: string;
	completed: number;
	total_tasks: number;
	tasks: ReviewPlanTask[];
}

export function createReviewPlanFromTodo(cwd: string, input: { slug?: string; todo: CodeReviewTodo }): ReviewPlan {
	const slug = sanitizeSlug(input.slug || input.todo.scope || "code-review");
	const rootPath = uniqueReviewPath(cwd, slug);
	const tasksDir = join(rootPath, "tasks");
	mkdirSync(tasksDir, { recursive: true });

	const tasks = input.todo.tasks.map((task, index): ReviewPlanTask => {
		const id = `R-${String(index + 1).padStart(3, "0")}`;
		const title = task.title;
		const file = `tasks/${id.toLowerCase()}-${sanitizeSlug(title)}.md`;
		const scope = extractPromptPaths(task.prompt);
		const kind = task.definition === "analyzer" ? "analysis" : "review";
		writeFileSync(
			join(rootPath, file),
			formatReviewTaskFile({ id, title, scope, kind, prompt: task.prompt }),
			"utf-8",
		);
		return { id, title, file, status: "pending", dependencies: [], requirements: [], scope, kind };
	});

	const contextFile = join(rootPath, "context.md");
	const indexFile = join(rootPath, "review-index.md");
	const checklistFile = join(rootPath, "checklist.json");
	writeFileSync(contextFile, formatReviewContext(input.todo), "utf-8");
	writeFileSync(indexFile, formatReviewIndex(slug, tasks), "utf-8");
	writeFileSync(checklistFile, formatChecklist(slug, tasks), "utf-8");

	return { slug: basename(rootPath), rootPath, contextFile, indexFile, checklistFile, tasks };
}

export function loadReviewPlan(pathOrSlug: string, cwd: string): ReviewPlan {
	const rootPath = resolveReviewPath(pathOrSlug, cwd);
	if (!rootPath) throw new Error(`Review plan not found: ${pathOrSlug}`);
	const contextFile = join(rootPath, "context.md");
	const indexFile = join(rootPath, "review-index.md");
	const checklistFile = join(rootPath, "checklist.json");
	const checklist = readChecklist(checklistFile);
	return {
		slug: checklist.review || basename(rootPath),
		rootPath,
		contextFile,
		indexFile,
		checklistFile,
		tasks: checklist.tasks,
	};
}

export function getNextReviewTask(plan: ReviewPlan): ReviewPlanTask | null {
	return plan.tasks.find((task) => task.status === "pending") ?? null;
}

export function updateReviewTaskStatus(plan: ReviewPlan, taskId: string, status: ReviewTaskStatus): void {
	const checklist = readChecklist(plan.checklistFile);
	const task = checklist.tasks.find((item) => item.id === taskId);
	if (!task) throw new Error(`Review task ${taskId} not found`);
	task.status = status;
	checklist.completed = checklist.tasks.filter((item) => item.status === "complete").length;
	checklist.total_tasks = checklist.tasks.length;
	writeFileSync(plan.checklistFile, JSON.stringify(checklist, null, 2), "utf-8");
}

export function recordReviewTaskResult(
	plan: ReviewPlan,
	taskId: string,
	status: ReviewTaskStatus,
	summary?: string,
): ReviewPlanTask {
	const checklist = readChecklist(plan.checklistFile);
	const task = checklist.tasks.find((item) => item.id === taskId);
	if (!task) throw new Error(`Review task ${taskId} not found`);
	task.status = status;
	if (summary) task.last_summary = summary;
	task.updated_at = new Date().toISOString();
	checklist.completed = checklist.tasks.filter((item) => item.status === "complete").length;
	checklist.total_tasks = checklist.tasks.length;
	writeFileSync(plan.checklistFile, JSON.stringify(checklist, null, 2), "utf-8");
	return task;
}

export function buildReviewTaskLionTasksParams(plan: ReviewPlan, task: ReviewPlanTask): RunTasksParams {
	const taskBrief = readFileSync(join(plan.rootPath, task.file), "utf-8");
	const codeReviewSkillPath = getInternalSkillPath("code-review");
	return {
		tasks: [
			{
				definition: task.kind === "analysis" ? "analyzer" : "reviewer",
				title: `${task.id}: ${task.title}`,
				prompt: [
					'<delegation kind="code-review-plan">',
					`  <review_plan path="${escapeXml(plan.rootPath)}" task_id="${escapeXml(task.id)}" task_file="${escapeXml(join(plan.rootPath, task.file))}" />`,
					"  <constraints>",
					"    <must>Load and follow the internal code-review skill before starting.</must>",
					"    <must>Use the review task file as the source of truth.</must>",
					"    <must_not>Edit files.</must_not>",
					"    <must_not>Ask the user for clarification.</must_not>",
					"  </constraints>",
					"  <task_brief>",
					escapeXml(taskBrief),
					"  </task_brief>",
					"</delegation>",
				].join("\n"),
				capabilities: { canEdit: false, canWrite: false, canExecute: task.kind === "review" },
				tools: task.kind === "analysis" ? ["read", "glob", "grep"] : ["read", "glob", "grep", "bash"],
				disabledTools: ["edit", "write", "multi-edit"],
				skillPaths: [codeReviewSkillPath],
			},
		],
		strategy: "sequential",
		concurrency: 1,
	};
}

export function listReviewPlans(cwd: string): string[] {
	const reviewsDir = join(cwd, ".reviews");
	if (!existsSync(reviewsDir)) return [];
	return readdirSync(reviewsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(reviewsDir, entry.name));
}

function resolveReviewPath(pathOrSlug: string, cwd: string): string | null {
	const direct = resolve(cwd, pathOrSlug);
	if (existsSync(join(direct, "checklist.json"))) return direct;
	const inReviews = resolve(cwd, ".reviews", pathOrSlug);
	if (existsSync(join(inReviews, "checklist.json"))) return inReviews;
	const candidates = listReviewPlans(cwd);
	if (!pathOrSlug && candidates.length === 1) return candidates[0];
	return candidates.find((candidate) => basename(candidate) === pathOrSlug) ?? null;
}

function readChecklist(path: string): ReviewChecklist {
	return JSON.parse(readFileSync(path, "utf-8")) as ReviewChecklist;
}

function uniqueReviewPath(cwd: string, slug: string): string {
	const reviewsDir = join(cwd, ".reviews");
	mkdirSync(reviewsDir, { recursive: true });
	const base = join(reviewsDir, slug);
	if (!existsSync(base)) return base;
	let index = 2;
	while (existsSync(`${base}-${index}`)) index++;
	return `${base}-${index}`;
}

function formatReviewContext(todo: CodeReviewTodo): string {
	return [
		`# Code Review Context`,
		"",
		`User Prompt: ${todo.userPrompt || "(none)"}`,
		`Selected Strategy: ${todo.selectedStrategy}`,
		`Scope: ${todo.scope}`,
		"",
		"## Review Priorities",
		"",
		"1. Uncommitted changes",
		"2. Recent committed changes",
		"3. Environment, skills, related functionality, and tests",
		"4. Functional gaps, validation gaps, and improvement options",
		"5. False-positive validation before reporting verified findings",
		"",
		"## Review Method",
		"",
		"- Start at broad environment and flow mapping before narrow bug reports.",
		"- Identify relevant packages, scripts, skills, tests, entrypoints, and runtime paths.",
		"- Define expected behavior from the prompt and inspected code before calling something a bug.",
		"- Each suspected finding must check callers, guards, config, schemas, tests, or intended behavior.",
		"- Report final output as verified findings, inferred risks, unknowns, and action plan.",
		"",
		"## Generated TODO",
		"",
		todo.summary,
		"",
	].join("\n");
}

function formatReviewIndex(slug: string, tasks: ReviewPlanTask[]): string {
	return [
		`# ${slug} Review Index`,
		"",
		"| Task | Kind | Status | Scope |",
		"| --- | --- | --- | --- |",
		...tasks.map((task) => `| ${task.id} ${task.title} | ${task.kind} | ${task.status} | ${task.scope.join(", ")} |`),
		"",
	].join("\n");
}

function formatReviewTaskFile(input: {
	id: string;
	title: string;
	scope: string[];
	kind: ReviewPlanTask["kind"];
	prompt: string;
}): string {
	return [
		`# ${input.id} ${input.title}`,
		"",
		`Kind: ${input.kind}`,
		"",
		"## Scope",
		"",
		input.scope.length ? input.scope.map((path) => `- ${path}`).join("\n") : "- unknown",
		"",
		"## Objective",
		"",
		"Find verified code review issues, functional gaps, validation gaps, and improvement options for this scope.",
		"",
		"## Delegation",
		"",
		"```xml",
		input.prompt,
		"```",
		"",
	].join("\n");
}

function formatChecklist(slug: string, tasks: ReviewPlanTask[]): string {
	return JSON.stringify(
		{
			version: 1,
			review: slug,
			completed: 0,
			total_tasks: tasks.length,
			tasks,
		} satisfies ReviewChecklist,
		null,
		2,
	);
}

function extractPromptPaths(prompt: string): string[] {
	const xmlPaths = Array.from(prompt.matchAll(/<path>(.*?)<\/path>/g)).map((match) => unescapeXml(match[1]));
	const markdownPaths = Array.from(prompt.matchAll(/^\s*[-*]\s+`?((?:\.{1,2}\/|\/|[\w.-]+\/)[^`\n]+?)`?\s*$/gm)).map(
		(match) => match[1].trim(),
	);
	return unique([...xmlPaths, ...markdownPaths]);
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function sanitizeSlug(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "code-review"
	);
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function unescapeXml(value: string): string {
	return value
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");
}
