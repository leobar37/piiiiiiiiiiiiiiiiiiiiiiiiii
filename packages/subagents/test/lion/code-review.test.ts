import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildCodeReviewLionTasksParams,
	buildCodeReviewTodo,
	type CodeReviewGitContext,
	collectCodeReviewGitContext,
} from "../../src/lion/code-review.js";
import { registerLionCommands } from "../../src/lion/commands.js";
import { createReviewPlanFromTodo, loadReviewPlan } from "../../src/lion/review-plan.js";
import { LionRuntime } from "../../src/lion/runtime.js";
import { registerLionTools } from "../../src/lion/tools.js";
import type { LionPlan } from "../../src/lion/types.js";

const dirtyGit: CodeReviewGitContext = {
	statusShort: " M packages/subagents/src/lion/commands.ts\n?? packages/subagents/src/lion/code-review.ts\n",
	diffNameOnly: "packages/subagents/src/lion/commands.ts\n",
	diffStat: " packages/subagents/src/lion/commands.ts | 10 ++++++++++\n",
	recentCommitLog: "abc123 add responsive sales flow\n",
	recentDiffNameOnly: "apps/product/src/sales.tsx\napps/product/src/responsive.css\n",
	recentDiffStat: " apps/product/src/sales.tsx | 20 ++++++++++++++++++++\n",
};

describe("Lion code review orchestration", () => {
	it("builds a prioritized read-only review TODO from dirty files", () => {
		const todo = buildCodeReviewTodo({ scope: "", git: dirtyGit });
		const params = buildCodeReviewLionTasksParams(todo);

		expect(todo.priorityFiles).toEqual([
			"packages/subagents/src/lion/commands.ts",
			"packages/subagents/src/lion/code-review.ts",
		]);
		expect(todo.recentCommitFiles).toEqual(["apps/product/src/sales.tsx", "apps/product/src/responsive.css"]);
		expect(todo.selectedStrategy).toBe("dirty_and_recent_commits");
		expect(todo.relatedCandidates.some((candidate) => candidate.includes("packages/subagents/src/lion"))).toBe(true);
		expect(params.strategy).toBe("parallel");
		expect(params.concurrency).toBeGreaterThan(0);
		expect(params.tasks?.every((task) => task.disabledTools?.includes("edit"))).toBe(true);
		expect(params.tasks?.every((task) => task.skillPaths?.some((path) => path.includes("skills/code-review")))).toBe(
			true,
		);
		expect(params.tasks?.[0].prompt).toContain("Try to disprove suspected findings");
		expect(params.tasks?.[0].prompt).toContain("false-positive check");
	});

	it("registers /lion-code-review, activates review strategy, and creates a durable plan", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lion-code-review-"));
		const pi = fakePiWithCommands();
		const runtime = new LionRuntime(pi as any, cwd);

		try {
			registerLionCommands(pi as any, runtime);
			await pi.commands.get("lion-code-review")!.handler("packages/subagents/src/lion", fakeCtx(cwd) as any);

			const injected = pi.messages.find((message) => message.content?.customType === "lion-orchestrator-feedback");
			expect(injected).toBeDefined();
			expect(runtime.state.strategy).toBe("review");
			expect(runtime.state.phase).toBe("planning");
			expect(runtime.state.activePlanPath).toContain(".reviews/packages-subagents-src-lion");
			expect(injected.content.content).toContain("Code review TODO");
			expect(injected.content.content).toContain("Durable review plan created");
			expect(injected.content.details.nextToolsRequired).toEqual(["lion_checklist_start_next"]);
			expect(injected.content.details.reviewPlan.rootPath).toContain(".reviews/packages-subagents-src-lion");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("creates a durable review plan and prepares the next review task through tools", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lion-code-review-plan-"));
		const todo = buildCodeReviewTodo({ scope: "crm feature", git: dirtyGit });
		const plan = createReviewPlanFromTodo(cwd, { slug: "crm feature", todo });
		const pi = fakePiWithTools();
		const runtime = new LionRuntime(pi as any, cwd);

		try {
			const loaded = loadReviewPlan(plan.rootPath, cwd);
			expect(loaded.tasks.length).toBeGreaterThan(0);
			expect(loaded.rootPath).toContain(".reviews/crm-feature");

			registerLionTools(runtime);
			const result = await pi.tools
				.get("lion_checklist_start_next")!
				.execute("tool-1", { kind: "review", reference: plan.rootPath }, undefined, undefined, fakeCtx(cwd) as any);

			expect(result.details.checklistTask.status).toBe("in_progress");
			expect(result.details.checklist.kind).toBe("review");
			expect(result.details.checklist.rootPath).toBe(plan.rootPath);
			expect(result.details.lionTasksParams.tasks[0].disabledTools).toContain("edit");
			expect(result.details.lionTasksParams.tasks[0].skillPaths[0]).toContain("skills/code-review");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("starts the next active review checklist task without an explicit reference", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lion-code-review-active-"));
		const todo = buildCodeReviewTodo({ scope: "sales responsive", git: dirtyGit });
		const plan = createReviewPlanFromTodo(cwd, { slug: "sales responsive", todo });
		const pi = fakePiWithTools();
		const runtime = new LionRuntime(pi as any, cwd);

		try {
			runtime.activateReview({
				kind: "structured",
				slug: plan.slug,
				rootPath: plan.rootPath,
				contextFile: plan.contextFile,
				indexFile: plan.indexFile,
				checklistFile: plan.checklistFile,
				tasks: plan.tasks,
			});
			registerLionTools(runtime);
			const result = await pi.tools
				.get("lion_checklist_start_next")!
				.execute("tool-1", { kind: "review" }, undefined, undefined, fakeCtx(cwd) as any);

			expect(result.details.checklist.kind).toBe("review");
			expect(result.details.checklistTask.status).toBe("in_progress");
			expect(result.details.lionTasksParams.tasks[0].skillPaths[0]).toContain("skills/code-review");
			expect(runtime.state.activeTaskId).toBe("R-001");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("creates durable review plans as the active Lion review strategy", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lion-code-review-boundary-"));
		const plan = writeActivePlanFixture(cwd);
		const originalChecklist = readFileSync(plan.checklistFile!, "utf-8");
		const pi = fakePiWithCommands();
		const runtime = new LionRuntime(pi as any, cwd);
		runtime.activatePlan(plan);

		try {
			registerLionCommands(pi as any, runtime);
			await pi.commands.get("lion-code-review")!.handler("crm feature", fakeCtx(cwd) as any);

			const injected = pi.messages.find((message) => message.content?.customType === "lion-orchestrator-feedback");
			expect(injected).toBeDefined();
			expect(injected.content.details.nextTools).toEqual([]);
			expect(injected.content.details.nextToolsRequired).toEqual(["lion_checklist_start_next"]);
			expect(injected.content.details.reviewPlan.rootPath).toContain(".reviews/crm-feature");
			expect(runtime.state.strategy).toBe("review");
			expect(runtime.state.phase).toBe("planning");
			expect(runtime.state.activePlanPath).toContain(".reviews/crm-feature");
			expect(readFileSync(plan.checklistFile!, "utf-8")).toBe(originalChecklist);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("records durable review task results through tools without touching .plans", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lion-code-review-record-"));
		const activePlan = writeActivePlanFixture(cwd);
		const originalPlanChecklist = readFileSync(activePlan.checklistFile!, "utf-8");
		const todo = buildCodeReviewTodo({ scope: "crm feature", git: dirtyGit });
		const review = createReviewPlanFromTodo(cwd, { slug: "crm feature", todo });
		const pi = fakePiWithTools();
		const runtime = new LionRuntime(pi as any, cwd);

		try {
			registerLionTools(runtime);
			await pi.tools
				.get("lion_checklist_start_next")!
				.execute(
					"tool-1",
					{ kind: "review", reference: review.rootPath },
					undefined,
					undefined,
					fakeCtx(cwd) as any,
				);
			await pi.tools.get("lion_checklist_record")!.execute(
				"tool-2",
				{
					kind: "review",
					reference: review.rootPath,
					taskId: "R-001",
					status: "complete",
					summary: "Verified no blocking findings",
				},
				undefined,
				undefined,
				fakeCtx(cwd) as any,
			);

			const updatedReview = loadReviewPlan(review.rootPath, cwd);
			expect(updatedReview.tasks[0].status).toBe("complete");
			expect(updatedReview.tasks[0].last_summary).toBe("Verified no blocking findings");
			expect(readFileSync(activePlan.checklistFile!, "utf-8")).toBe(originalPlanChecklist);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("collects recent commit files from short git histories", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "lion-code-review-short-git-"));

		try {
			runGit(cwd, ["init"]);
			writeFileSync(join(cwd, "feature.ts"), "export const feature = true;\n");
			runGit(cwd, ["add", "feature.ts"]);
			runGit(cwd, ["-c", "user.name=Lion", "-c", "user.email=lion@example.com", "commit", "-m", "add feature"]);

			const git = await collectCodeReviewGitContext(cwd);

			expect(git.recentCommitLog).toContain("add feature");
			expect(git.recentDiffNameOnly).toContain("feature.ts");
			expect(git.recentDiffStat).toContain("feature.ts");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

function runGit(cwd: string, args: string[]): void {
	execFileSync("git", args, { cwd, stdio: "ignore" });
}

function fakePiWithCommands() {
	return {
		messages: [] as any[],
		commands: new Map<string, any>(),
		registerCommand(name: string, command: any) {
			this.commands.set(name, command);
		},
		sendMessage(content: any, options: any) {
			this.messages.push({ content, options });
		},
		appendEntry() {},
	};
}

function fakePiWithTools() {
	return {
		tools: new Map<string, any>(),
		registerTool(tool: any) {
			this.tools.set(tool.name, tool);
		},
		appendEntry() {},
	};
}

function fakeCtx(cwd: string) {
	return {
		cwd,
		sessionManager: {
			getCwd: () => cwd,
			getSessionId: () => "test-session",
			getEntries: () => [],
			getLeafId: () => undefined,
			getSessionFile: () => undefined,
			getSessionName: () => undefined,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: {
			setStatus() {},
			showMessage() {},
			theme: {
				fg: (_name: string, text: string) => text,
			},
		},
		modelRegistry: {
			getApiKeyAndHeaders: () => Promise.resolve({ ok: true, apiKey: "test", headers: {} }),
		},
	};
}

function writeActivePlanFixture(cwd: string): LionPlan {
	const rootPath = join(cwd, ".plans", "active-feature");
	mkdirSync(rootPath, { recursive: true });
	const checklistFile = join(rootPath, "checklist.json");
	const indexFile = join(rootPath, "task-index.md");
	writeFileSync(indexFile, "# active-feature\n", "utf-8");
	writeFileSync(
		checklistFile,
		JSON.stringify(
			{
				completed: 0,
				total_tasks: 1,
				tasks: [
					{
						id: "T-001",
						title: "Build active feature",
						file: "tasks/t-001.md",
						status: "pending",
						dependencies: [],
						requirements: [],
					},
				],
			},
			null,
			2,
		),
		"utf-8",
	);
	return {
		kind: "structured",
		slug: "active-feature",
		rootPath,
		indexFile,
		checklistFile,
		tasks: [
			{
				id: "T-001",
				title: "Build active feature",
				file: "tasks/t-001.md",
				status: "pending",
				dependencies: [],
				requirements: [],
			},
		],
	};
}
