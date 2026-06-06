import { execFile } from "node:child_process";
import { basename, dirname, extname } from "node:path";
import { promisify } from "node:util";
import { getInternalSkillPath } from "../internal-skills.js";
import type { RunTasksParams } from "./task-runner.js";
import type { LionPlan } from "./types.js";

const execFileAsync = promisify(execFile);
const REVIEW_CONCURRENCY = 3;

export interface CodeReviewGitContext {
	statusShort: string;
	diffNameOnly: string;
	diffStat: string;
	recentCommitLog: string;
	recentDiffNameOnly: string;
	recentDiffStat: string;
}

export interface CodeReviewTodo {
	scope: string;
	userPrompt: string;
	selectedStrategy: "dirty" | "recent_commits" | "dirty_and_recent_commits" | "prompt_scope";
	priorityFiles: string[];
	recentCommitFiles: string[];
	relatedCandidates: string[];
	tasks: NonNullable<RunTasksParams["tasks"]>;
	summary: string;
}

export async function collectCodeReviewGitContext(cwd: string): Promise<CodeReviewGitContext> {
	const [statusShort, diffNameOnly, diffStat, recentCommitLog, recentDiff] = await Promise.all([
		runGit(cwd, ["status", "--short"]),
		runGit(cwd, ["diff", "--name-only", "HEAD"]),
		runGit(cwd, ["diff", "--stat", "HEAD"]),
		runGit(cwd, ["log", "--oneline", "-n", "5"]),
		collectRecentCommitDiff(cwd),
	]);
	const { recentDiffNameOnly, recentDiffStat } = recentDiff;

	return { statusShort, diffNameOnly, diffStat, recentCommitLog, recentDiffNameOnly, recentDiffStat };
}

export function buildCodeReviewTodo(input: { scope: string; git: CodeReviewGitContext }): CodeReviewTodo {
	const explicitScope = input.scope.trim();
	const dirtyFiles = unique([...parseStatusFiles(input.git.statusShort), ...splitLines(input.git.diffNameOnly)]);
	const recentCommitFiles = splitLines(input.git.recentDiffNameOnly);
	const selectedStrategy = selectReviewStrategy(explicitScope, dirtyFiles, recentCommitFiles);
	const priorityFiles = selectedStrategy === "recent_commits" ? [] : dirtyFiles;
	const commitFiles = selectedStrategy === "dirty" ? [] : recentCommitFiles;
	const relatedCandidates = inferRelatedCandidates(
		unique([...priorityFiles, ...commitFiles, ...(explicitScope ? [explicitScope] : [])]),
	);
	const reviewScope = formatReviewScope(explicitScope, selectedStrategy);
	const codeReviewSkillPath = getInternalSkillPath("code-review");
	const diffStat = input.git.diffStat.trim() || "(no diff stat available)";
	const recentDiffStat = input.git.recentDiffStat.trim() || "(no recent commit diff stat available)";
	const recentCommitLog = input.git.recentCommitLog.trim() || "(no recent commits available)";

	const tasks: NonNullable<RunTasksParams["tasks"]> = [];

	if (priorityFiles.length > 0) {
		tasks.push({
			definition: "reviewer",
			title: "Review uncommitted changes",
			prompt: buildDelegation({
				role: "reviewer",
				objective:
					"Review uncommitted changes first. Report correctness, security, data loss, test, API contract, and maintainability findings before style issues.",
				scope: priorityFiles,
				context: [
					`User prompt: ${explicitScope || "(none)"}`,
					`Requested scope: ${reviewScope}`,
					`Selected strategy: ${selectedStrategy}`,
					"Priority: uncommitted files from git status/diff.",
					"Diff stat:",
					diffStat,
				],
				output:
					"Findings first, ordered by severity. Include file references, evidence checked, false-positive checks, unknowns, and residual risks. If no blocking issues are found, say so clearly.",
			}),
			capabilities: { canEdit: false, canWrite: false, canExecute: true },
			tools: ["read", "glob", "grep", "bash"],
			disabledTools: ["edit", "write", "multi-edit"],
			skillPaths: [codeReviewSkillPath],
		});
	}

	if (commitFiles.length > 0) {
		tasks.push({
			definition: "reviewer",
			title: "Review recent commits",
			prompt: buildDelegation({
				role: "reviewer",
				objective:
					"Review recent committed changes. Report correctness, production risk, test gaps, behavior regressions, and maintainability findings before style issues.",
				scope: commitFiles,
				context: [
					`User prompt: ${explicitScope || "(none)"}`,
					`Requested scope: ${reviewScope}`,
					`Selected strategy: ${selectedStrategy}`,
					"Priority: recent committed changes inferred from the user prompt or absence of dirty work.",
					"Recent commits:",
					recentCommitLog,
					"Recent commit diff stat:",
					recentDiffStat,
				],
				output:
					"Findings first, ordered by severity. Include commit/diff evidence checked, file references, false-positive checks, unknowns, and residual risks. If no blocking issues are found, say so clearly.",
			}),
			capabilities: { canEdit: false, canWrite: false, canExecute: true },
			tools: ["read", "glob", "grep", "bash"],
			disabledTools: ["edit", "write", "multi-edit"],
			skillPaths: [codeReviewSkillPath],
		});
	}

	if (relatedCandidates.length > 0) {
		tasks.push({
			definition: "analyzer",
			title: "Map environment, skills, and related functionality",
			prompt: buildDelegation({
				role: "analyzer",
				objective:
					"Map repository environment, currently relevant skills, related functionality, ideal behavior, tests, imports, public exports, runtime flows, and nearby modules so later reviewers can search for gaps efficiently.",
				scope: relatedCandidates,
				context: [
					`User prompt: ${explicitScope || "(none)"}`,
					`Requested scope: ${reviewScope}`,
					`Selected strategy: ${selectedStrategy}`,
					"Priority: related functionality inferred from dirty files, recent commit files, prompt scope, and neighboring test/source paths.",
					"Dirty files:",
					formatList(priorityFiles),
					"Recent commit files:",
					formatList(commitFiles),
				],
				output:
					"Return environment notes, relevant skills, impacted areas, expected behavior, files inspected, likely review gaps, tests or validation that should be checked, and unknowns. Do not edit files.",
			}),
			capabilities: { canEdit: false, canWrite: false, canExecute: false },
			tools: ["read", "glob", "grep"],
			disabledTools: ["edit", "write", "multi-edit", "bash"],
			skillPaths: [codeReviewSkillPath],
		});
	}

	if (tasks.length === 0) {
		tasks.push({
			definition: "reviewer",
			title: "Review requested scope",
			prompt: buildDelegation({
				role: "reviewer",
				objective:
					"Review the requested scope. If no files or diff can be found, report that the review is blocked by missing scope instead of inventing findings.",
				scope: explicitScope ? [explicitScope] : [],
				context: [
					`User prompt: ${explicitScope || "(none)"}`,
					`Requested scope: ${reviewScope}`,
					`Selected strategy: ${selectedStrategy}`,
					"No dirty files or recent commit files were discovered from git.",
				],
				output:
					"Return findings, evidence checked, unknowns, and the exact additional scope needed if review cannot proceed.",
			}),
			capabilities: { canEdit: false, canWrite: false, canExecute: true },
			tools: ["read", "glob", "grep", "bash"],
			disabledTools: ["edit", "write", "multi-edit"],
			skillPaths: [codeReviewSkillPath],
		});
	}

	return {
		scope: reviewScope,
		userPrompt: explicitScope,
		selectedStrategy,
		priorityFiles,
		recentCommitFiles: commitFiles,
		relatedCandidates,
		tasks,
		summary: formatReviewTodoSummary(
			reviewScope,
			explicitScope,
			selectedStrategy,
			priorityFiles,
			commitFiles,
			relatedCandidates,
			tasks,
		),
	};
}

export function buildPlanCodeReviewTodo(input: {
	plan: LionPlan;
	focus: string;
	git: CodeReviewGitContext;
}): CodeReviewTodo {
	const focus = input.focus.trim();
	const dirtyFiles = unique([...parseStatusFiles(input.git.statusShort), ...splitLines(input.git.diffNameOnly)]);
	const recentCommitFiles = splitLines(input.git.recentDiffNameOnly);
	const selectedStrategy: CodeReviewTodo["selectedStrategy"] =
		dirtyFiles.length > 0 ? "dirty" : recentCommitFiles.length > 0 ? "recent_commits" : "prompt_scope";
	const implementationFiles = selectedStrategy === "recent_commits" ? recentCommitFiles : dirtyFiles;
	const planTaskFiles = input.plan.tasks.map((task) => `${input.plan.rootPath}/${task.file}`);
	const reviewScope = `Lion plan ${input.plan.slug}${focus ? `: ${focus}` : ""}`;
	const codeReviewSkillPath = getInternalSkillPath("code-review");
	const diffStat = input.git.diffStat.trim() || "(no diff stat available)";
	const recentDiffStat = input.git.recentDiffStat.trim() || "(no recent commit diff stat available)";
	const recentCommitLog = input.git.recentCommitLog.trim() || "(no recent commits available)";
	const tasks: NonNullable<RunTasksParams["tasks"]> = [
		{
			definition: "analyzer",
			title: "Map plan implementation surface",
			prompt: buildDelegation({
				role: "analyzer",
				objective:
					"Map the active Lion plan, executed task scope, implementation changes, tests, and likely regression surfaces before review starts.",
				scope: unique([input.plan.rootPath, ...planTaskFiles, ...implementationFiles]),
				context: [
					`Review source: active Lion plan ${input.plan.slug}`,
					`Plan path: ${input.plan.rootPath}`,
					`Focus: ${focus || "(none)"}`,
					`Selected strategy: ${selectedStrategy}`,
					"Plan tasks:",
					formatList(input.plan.tasks.map((task) => `${task.id}: ${task.title} (${task.file})`)),
					"Implementation files from git:",
					formatList(implementationFiles),
					"Diff stat:",
					selectedStrategy === "recent_commits" ? recentDiffStat : diffStat,
					"Recent commits:",
					recentCommitLog,
				],
				output:
					"Return plan intent, implemented surface, files inspected, likely risk areas, validation targets, missing evidence, and recommended reviewer focus. Do not edit files.",
			}),
			capabilities: { canEdit: false, canWrite: false, canExecute: false },
			tools: ["read", "glob", "grep"],
			disabledTools: ["edit", "write", "multi-edit", "bash"],
			skillPaths: [codeReviewSkillPath],
		},
		{
			definition: "reviewer",
			title: "Review plan implementation for regressions",
			prompt: buildDelegation({
				role: "reviewer",
				objective:
					"Review the implementation produced for the active Lion plan. Verify that plan requirements were satisfied without introducing correctness, data loss, API contract, security, test, or behavior regressions.",
				scope: unique([...implementationFiles, input.plan.rootPath, ...planTaskFiles]),
				context: [
					`Review source: active Lion plan ${input.plan.slug}`,
					`Plan path: ${input.plan.rootPath}`,
					`Focus: ${focus || "(none)"}`,
					`Selected strategy: ${selectedStrategy}`,
					"Plan tasks:",
					formatList(input.plan.tasks.map((task) => `${task.id}: ${task.title} (${task.file})`)),
					"Implementation files from git:",
					formatList(implementationFiles),
					"Diff stat:",
					selectedStrategy === "recent_commits" ? recentDiffStat : diffStat,
					"Recent commits:",
					recentCommitLog,
				],
				output:
					"Findings first, ordered by severity. For each finding, include file references, plan/task expectation, evidence checked, false-positive check, and required fix. If no blocking issues are found, say so clearly with residual risks.",
			}),
			capabilities: { canEdit: false, canWrite: false, canExecute: true },
			tools: ["read", "glob", "grep", "bash"],
			disabledTools: ["edit", "write", "multi-edit"],
			skillPaths: [codeReviewSkillPath],
		},
	];

	return {
		scope: reviewScope,
		userPrompt: focus,
		selectedStrategy,
		priorityFiles: selectedStrategy === "recent_commits" ? [] : implementationFiles,
		recentCommitFiles: selectedStrategy === "recent_commits" ? implementationFiles : [],
		relatedCandidates: unique([input.plan.rootPath, ...planTaskFiles]),
		tasks,
		summary: formatReviewTodoSummary(
			reviewScope,
			focus,
			selectedStrategy,
			selectedStrategy === "recent_commits" ? [] : implementationFiles,
			selectedStrategy === "recent_commits" ? implementationFiles : [],
			unique([input.plan.rootPath, ...planTaskFiles]),
			tasks,
		),
	};
}

export function buildCodeReviewLionTasksParams(todo: CodeReviewTodo): RunTasksParams {
	return {
		tasks: todo.tasks,
		strategy: "parallel",
		concurrency: Math.min(REVIEW_CONCURRENCY, Math.max(todo.tasks.length, 1)),
	};
}

function buildDelegation(input: {
	role: string;
	objective: string;
	scope: string[];
	context: string[];
	output: string;
}): string {
	return [
		'<delegation kind="code-review">',
		`  <role>${escapeXml(input.role)}</role>`,
		`  <objective>${escapeXml(input.objective)}</objective>`,
		"  <scope>",
		...(input.scope.length > 0
			? input.scope.map((path) => `    <path>${escapeXml(path)}</path>`)
			: ['    <path unknown="true" />']),
		"  </scope>",
		"  <constraints>",
		"    <must>Load and follow the internal code-review skill before starting.</must>",
		"    <must>Prioritize uncommitted changes before related functionality.</must>",
		"    <must>Report production-risk findings before style or preference comments.</must>",
		"    <must>Try to disprove suspected findings before reporting them; include the false-positive check in the output.</must>",
		"    <must_not>Edit files.</must_not>",
		"    <must_not>Ask the user for clarification.</must_not>",
		"    <must_not>Claim validation without concrete evidence.</must_not>",
		"  </constraints>",
		"  <context>",
		...input.context.map((line) => `    ${escapeXml(line)}`),
		"  </context>",
		"  <output>",
		`    <must_return>${escapeXml(input.output)}</must_return>`,
		"  </output>",
		"</delegation>",
	].join("\n");
}

function formatReviewTodoSummary(
	scope: string,
	userPrompt: string,
	selectedStrategy: CodeReviewTodo["selectedStrategy"],
	priorityFiles: string[],
	recentCommitFiles: string[],
	relatedCandidates: string[],
	tasks: NonNullable<RunTasksParams["tasks"]>,
): string {
	return [
		"Code review TODO",
		`User prompt: ${userPrompt || "(none)"}`,
		`Scope: ${scope}`,
		`Selected strategy: ${selectedStrategy}`,
		"",
		"Priority 1 - uncommitted changes:",
		formatList(priorityFiles),
		"",
		"Priority 2 - recent commit changes:",
		formatList(recentCommitFiles),
		"",
		"Priority 3 - environment, skills, and related functionality candidates:",
		formatList(relatedCandidates),
		"",
		"Subagent tasks:",
		...tasks.map((task, index) => `${index + 1}. ${task.definition}: ${task.title}`),
	].join("\n");
}

function selectReviewStrategy(
	prompt: string,
	dirtyFiles: string[],
	recentCommitFiles: string[],
): CodeReviewTodo["selectedStrategy"] {
	const normalized = prompt.toLowerCase();
	const wantsDirty =
		/no commitead|uncommitted|dirty|working tree|sin commitear|no esta commiteado|no está commiteado/.test(
			normalized,
		);
	const wantsCommits = /commit|commits|branch|rama|feature|ultimos|últimos|recientes/.test(normalized);
	if (wantsDirty) return "dirty";
	if (wantsCommits && dirtyFiles.length > 0 && recentCommitFiles.length > 0) return "dirty_and_recent_commits";
	if (wantsCommits && recentCommitFiles.length > 0) return "recent_commits";
	if (dirtyFiles.length > 0 && recentCommitFiles.length > 0) return "dirty_and_recent_commits";
	if (dirtyFiles.length > 0) return "dirty";
	if (recentCommitFiles.length > 0) return "recent_commits";
	return "prompt_scope";
}

function formatReviewScope(prompt: string, strategy: CodeReviewTodo["selectedStrategy"]): string {
	if (prompt) return prompt;
	switch (strategy) {
		case "dirty":
			return "uncommitted changes";
		case "recent_commits":
			return "recent commits";
		case "dirty_and_recent_commits":
			return "uncommitted changes and recent commits";
		default:
			return "review prompt scope";
	}
}

function parseStatusFiles(statusShort: string): string[] {
	return statusShort
		.split(/\r?\n/)
		.filter((line) => line.trim())
		.map((line) => line.slice(3).trim())
		.map((path) => {
			const renameIndex = path.indexOf(" -> ");
			return renameIndex >= 0 ? path.slice(renameIndex + 4).trim() : path;
		})
		.filter(Boolean);
}

function inferRelatedCandidates(files: string[]): string[] {
	const candidates = new Set<string>();

	for (const file of files) {
		const dir = dirname(file);
		const ext = extname(file);
		const base = basename(file, ext);
		if (dir && dir !== ".") candidates.add(dir);

		if (ext) {
			candidates.add(`${dir}/${base}.test${ext}`);
			candidates.add(`${dir}/${base}.spec${ext}`);
			candidates.add(`${dir}/__tests__/${base}.test${ext}`);
		}

		if (file.includes("/src/")) {
			candidates.add(file.replace("/src/", "/test/").replace(ext, `.test${ext}`));
			candidates.add(file.replace("/src/", "/tests/").replace(ext, `.test${ext}`));
		}
	}

	for (const file of files) candidates.delete(file);
	return Array.from(candidates).filter((candidate) => candidate && candidate !== ".");
}

function splitLines(value: string): string[] {
	return value
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function formatList(items: string[]): string {
	if (items.length === 0) return "- none";
	return items.map((item) => `- ${item}`).join("\n");
}

async function runGit(cwd: string, args: string[]): Promise<string> {
	try {
		const { stdout } = await execFileAsync("git", args, { cwd });
		return stdout;
	} catch {
		return "";
	}
}

async function collectRecentCommitDiff(cwd: string): Promise<{
	recentDiffNameOnly: string;
	recentDiffStat: string;
}> {
	const commits = splitLines(await runGit(cwd, ["rev-list", "--max-count=5", "HEAD"]));
	if (commits.length === 0) {
		return { recentDiffNameOnly: "", recentDiffStat: "" };
	}

	const nameOutput = await Promise.all(
		commits.map((commit) => runGit(cwd, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit])),
	);
	const statOutput = await Promise.all(
		commits.map((commit) => runGit(cwd, ["show", "--stat", "--format=", "--no-renames", commit])),
	);

	return {
		recentDiffNameOnly: unique(nameOutput.flatMap(splitLines)).join("\n"),
		recentDiffStat: statOutput
			.map((item) => item.trim())
			.filter(Boolean)
			.join("\n\n"),
	};
}

function unique(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}
