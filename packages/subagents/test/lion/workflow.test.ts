import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolCallEvent, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { registerLionCommands } from "../../src/lion/commands.js";
import {
	createLionCore,
	finishRun,
	type LionCore,
	recordReviewVerdict,
	recordSubagentResult,
	startRun,
} from "../../src/lion/core.js";
import { classifyLionTaskResult } from "../../src/lion/evidence.js";
import { lionExtension } from "../../src/lion/index.js";
import { MainSessionBridge } from "../../src/lion/main-session.js";
import { LionChecklistFile } from "../../src/lion/plans/checklist.js";
import {
	getNextExecutableTask,
	loadLionPlan,
	recordStructuredTaskResult,
	updateStructuredTaskStatus,
} from "../../src/lion/plans/index.js";
import { StructuredLionPlanFile } from "../../src/lion/plans/structured.js";
import { buildPlanReviewPrompt } from "../../src/lion/prompts/plan-reviewer.js";
import { buildPlanningSystemPrompt } from "../../src/lion/prompts/planning.js";
import { createReviewPlanFromTodo } from "../../src/lion/review-plan.js";
import { LionRuntime } from "../../src/lion/runtime.js";
import { getLionStatePath, readLionState, writeLionState } from "../../src/lion/state-store.js";
import { hasPlanReference } from "../../src/lion/strategies/shared.js";
import { TaskRunner } from "../../src/lion/task-runner.js";
import { registerLionTools } from "../../src/lion/tools.js";
import type { LionPlan, LionTask } from "../../src/lion/types.js";
import { buildLionSubagentWidgetLines } from "../../src/lion/ui/subagents-widget.js";
import { parseReviewVerdict } from "../../src/lion/utils.js";
import type { DelegationResult, DelegationTask } from "../../src/types.js";

const plan: LionPlan = {
	kind: "structured",
	slug: "test-plan",
	rootPath: "/tmp/test-plan",
	indexFile: "/tmp/test-plan/task-index.md",
	tasks: [
		{
			id: "T-001",
			title: "Test task",
			file: "tasks/T-001.md",
			status: "pending",
			dependencies: [],
			requirements: [],
		},
	],
};

const task: LionTask = {
	id: "T-001",
	title: "Implement workflow",
	file: "tasks/T-001.md",
	status: "pending",
	dependencies: [],
	requirements: [],
};

const plainTheme = {
	fg: (_name: string, text: string) => text,
	bold: (text: string) => text,
};

function delegationResult(task: DelegationTask, status: DelegationResult["status"], summary: string): DelegationResult {
	return {
		taskId: task.id,
		agent: task.definition,
		status,
		summary,
		structuredResult: true,
		duration: 1,
		turnCount: 1,
		finalState: {
			instanceId: `instance-${task.id}`,
			taskId: task.id,
			definitionName: task.definition,
			cwd: TEST_CWD,
			state: status === "completed" ? "completed" : "failed",
			startTime: 1,
			endTime: 2,
			turnCount: 1,
			lastActivityAt: 2,
			currentTool: null,
			error: status === "completed" ? null : status,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 1,
		},
	};
}

function testStartRunInitializesRun(): void {
	const core: LionCore = createLionCore();
	startRun(core, { runId: "run-1", plan, task, maxAttempts: 3 });
	assert.ok(core.activeRun);
	assert.equal(core.activeRun!.runId, "run-1");
	assert.equal(core.activeRun!.taskId, "T-001");
	assert.equal(core.activeRun!.status, "executing");
	assert.equal(core.activeRun!.attempts, 0);
	assert.equal(core.activeRun!.maxAttempts, 3);
	assert.equal(core.activeRun!.verdict, null);
}

function testFinishRunMarksComplete(): void {
	const cwd = createStructuredPlanDirWithChecklist();
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		const loadedPlan = new StructuredLionPlanFile(cwd).loadPlan();
		startRun(runtime.core, { runId: "run-1", plan: loadedPlan, task: loadedPlan.tasks[0], maxAttempts: 3 });
		recordReviewVerdict(runtime.core, "approved", "ok\n<LION-APPROVE>");

		const result = finishRun(runtime.core, "approved");

		assert.equal(result.status, "approved");
		assert.equal(result.taskId, loadedPlan.tasks[0].id);
		assert.equal(runtime.core.activeRun, null);
		assert.equal(runtime.core.runHistory.length, 1);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testFinishRunRetriesOnReject(): void {
	const core: LionCore = createLionCore();
	startRun(core, { runId: "run-1", plan, task, maxAttempts: 3 });
	recordReviewVerdict(core, "rejected", "needs fix\n<LION-REJECT>");

	const result = finishRun(core, "rejected");
	assert.equal(result.status, "rejected");
	assert.equal(core.activeRun, null);
	assert.equal(core.runHistory.length, 1);
}

function testFinishRunFailsAfterMaxAttempts(): void {
	const core: LionCore = createLionCore();
	startRun(core, { runId: "run-1", plan, task, maxAttempts: 2 });
	recordReviewVerdict(core, "rejected", "needs fix\n<LION-REJECT>");
	finishRun(core, "rejected");

	// Manual retry - restart the run
	startRun(core, { runId: "run-2", plan, task, maxAttempts: 2 });
	recordReviewVerdict(core, "rejected", "still bad\n<LION-REJECT>");
	const result = finishRun(core, "rejected");

	assert.equal(result.status, "rejected");
	assert.equal(core.activeRun, null);
	assert.equal(core.runHistory.length, 2);
}

function testRecordSubagentResultUpdatesRun(): void {
	const core: LionCore = createLionCore();
	startRun(core, { runId: "run-1", plan, task, maxAttempts: 3 });
	const result = delegationResult(
		{ id: "task-1", definition: "coder", prompt: "do it" } as DelegationTask,
		"completed",
		"done",
	);
	recordSubagentResult(core, "executor", result);

	assert.equal(core.activeRun!.subagents.length, 1);
	assert.equal(core.activeRun!.subagents[0].status, "completed");
}

function testParseReviewVerdict(): void {
	assert.equal(parseReviewVerdict("looks good\n<LION-APPROVE>"), "approved");
	assert.equal(parseReviewVerdict("needs fix\n<LION-REJECTED>"), "rejected");
	assert.equal(parseReviewVerdict("no marker"), "unknown");
	assert.equal(parseReviewVerdict("<LION-APPROVE>"), "approved");
	assert.equal(parseReviewVerdict("<LION-REJECTED>"), "rejected");
}

function testBuildPlanReviewPrompt(): void {
	const prompt = buildPlanReviewPrompt(plan);
	assert.ok(prompt.includes("test-plan"));
	assert.ok(prompt.includes("T-001"));
	assert.ok(prompt.includes("Do not edit files."));
}

function testBuildPlanningSystemPrompt(): void {
	const state = {
		version: 2 as const,
		active: true,
		strategy: "plan" as const,
		phase: "planning" as const,
		planKind: "structured" as const,
		activePlanPath: "/tmp/test-plan",
		activePlanSlug: "test-plan",
		activeTaskId: null,
		maxAttempts: 3,
		lastRunId: null,
		lastBuild: undefined,
	};
	const prompt = buildPlanningSystemPrompt(state);
	assert.ok(prompt.includes("test-plan"));
	assert.ok(prompt.includes("compact structured delegation brief"));
	assert.ok(prompt.includes("Do not paste full plan files"));
	assert.ok(prompt.includes("<delegation>"));
	assert.ok(prompt.includes("<must_not>Ask the user for clarification.</must_not>"));
	assert.ok(prompt.includes('task_id="T-001"'));
	assert.ok(prompt.includes("verificationStatus"));
	assert.ok(prompt.includes("Never treat a subagent self-report as proof"));
	assert.ok(prompt.includes('source: "active_plan_next_task"'));
	assert.ok(!prompt.includes("lion_next_task"));
	assert.ok(!prompt.includes("lion_record_task_result"));
	assert.ok(prompt.includes("Never read, edit, write, or multi-edit .plans/**/checklist.json directly"));
	assert.ok(prompt.includes("Interpret User Intent First"));
	assert.ok(prompt.includes("This interpretation belongs to the main Lion orchestration thread"));
	assert.ok(prompt.includes("Do not delegate the raw user prompt just to understand it"));
	assert.ok(prompt.includes("use any relevant loaded skill"));
	assert.ok(prompt.includes("Executor delegations must reference the active plan and task file"));
	assert.ok(prompt.includes("/lion-activate with no reference"));
	assert.ok(prompt.includes("Do not call lion_activate_plan and do not infer or reuse an existing plan"));
	assert.ok(prompt.includes("previous ordinary chat as planning context for a new plan"));
}

function testHasPlanReferenceSupportsStructuredBriefs(): void {
	assert.equal(hasPlanReference('<plan path=".plans/test" />\n<task id="T-001" />'), true);
	assert.equal(hasPlanReference("Plan path: .plans/test\nTask id: T-001\nObjective: Do it"), true);
	assert.equal(hasPlanReference("Objective: Do it\nScope: packages/subagents"), false);
}

function testReviewPlanExtractsMarkdownScopePaths(): void {
	const cwd = mkdtempSync(join(tmpdir(), "lion-review-plan-"));
	try {
		const plan = createReviewPlanFromTodo(cwd, {
			slug: "markdown-scope",
			todo: {
				scope: "markdown scope",
				userPrompt: "",
				selectedStrategy: "prompt_scope",
				priorityFiles: [],
				recentCommitFiles: [],
				relatedCandidates: [],
				summary: "Review markdown scope",
				tasks: [
					{
						definition: "reviewer",
						title: "Review markdown paths",
						prompt: [
							"Role: reviewer",
							"Scope:",
							"- `packages/subagents/src/lion/tools.ts`",
							"- packages/subagents/src/lion/strategies/plan.ts",
						].join("\n"),
					},
				],
			},
		});

		assert.deepEqual(plan.tasks[0].scope, [
			"packages/subagents/src/lion/tools.ts",
			"packages/subagents/src/lion/strategies/plan.ts",
		]);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testBuildSimpleSystemPrompt(): void {
	const state = {
		version: 2 as const,
		active: true,
		strategy: "simple" as const,
		phase: "building" as const,
		planKind: null,
		activePlanPath: null,
		activePlanSlug: null,
		activeTaskId: null,
		maxAttempts: 3,
		lastRunId: null,
		lastBuild: undefined,
	};
	const prompt = buildPlanningSystemPrompt(state);
	assert.ok(prompt.includes("Lion simple mode is active"));
	assert.ok(prompt.includes("Do not create, activate, or require a durable plan"));
	assert.ok(prompt.includes("Use lion_tasks"));
	assert.ok(!prompt.includes("lion_next_task: Select the next executable"));
	assert.ok(!prompt.includes("checklist.json"));
}

async function testTaskRunnerAddsPlanContextToDelegations(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	const capturedPrompts: string[] = [];
	const capturedSkillPaths: Array<string[] | undefined> = [];
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		const loaded = loadLionPlan(dir);
		runtime.activatePlan(loaded);
		runtime.setPhase("building");
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				capturedPrompts.push(task.prompt);
				capturedSkillPaths.push(task.skillPaths);
				return {
					instanceId: `inst-${task.id}`,
					getState: () => ({
						instanceId: `inst-${task.id}`,
						taskId: task.id,
						definitionName: task.definition,
						state: "completed",
						startTime: 1,
						endTime: 2,
						turnCount: 1,
						lastActivityAt: 2,
						currentTool: null,
						error: null,
						toolCount: 0,
						currentToolStartedAt: null,
						durationMs: 1,
					}),
					start: async () => delegationResult(task, "completed", "bun x test passed"),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		await runner.run(
			fakeCtx({}) as any,
			{
				strategy: "sequential",
				tasks: [
					{
						definition: "executor",
						title: "T-001: Task 1",
						prompt: "Implement the task.",
						skillPaths: [".codex/skills/core/SKILL.md"],
					},
				],
			},
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(capturedPrompts.length, 1);
		assert.ok(capturedPrompts[0].includes("<lion_context>"));
		assert.ok(capturedPrompts[0].includes(`path="${dir}`));
		assert.ok(capturedPrompts[0].includes('id="T-001"'));
		assert.ok(capturedPrompts[0].includes("Use any relevant loaded skill"));
		assert.deepEqual(capturedSkillPaths[0], [".codex/skills/core/SKILL.md"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerAddsPlanContextWhenBriefHasGenericLionContext(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	const capturedPrompts: string[] = [];
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		const loaded = loadLionPlan(dir);
		runtime.activatePlan(loaded);
		runtime.setPhase("building");
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				capturedPrompts.push(task.prompt);
				return {
					instanceId: `inst-${task.id}`,
					getState: () => ({
						instanceId: `inst-${task.id}`,
						taskId: task.id,
						definitionName: task.definition,
						state: "completed",
						startTime: 1,
						endTime: 2,
						turnCount: 1,
						lastActivityAt: 2,
						currentTool: null,
						error: null,
						toolCount: 0,
						currentToolStartedAt: null,
						durationMs: 1,
					}),
					start: async () => delegationResult(task, "completed", "done"),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		await runner.run(
			fakeCtx({}) as any,
			{
				strategy: "sequential",
				tasks: [
					{
						definition: "executor",
						title: "T-001: Task 1",
						prompt: "<lion_context>Generic context only.</lion_context>\n\nImplement the task.",
					},
				],
			},
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(capturedPrompts.length, 1);
		assert.ok(capturedPrompts[0].includes(`path="${dir}`));
		assert.ok(capturedPrompts[0].includes('id="T-001"'));
		assert.ok(capturedPrompts[0].includes("Generic context only."));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerAddsSimpleContextToDelegations(): Promise<void> {
	const capturedPrompts: string[] = [];
	const capturedOrchestration: Array<DelegationTask["orchestration"]> = [];
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activateSimple();
	runtime.activeController = {
		createInstance(task: DelegationTask) {
			capturedPrompts.push(task.prompt);
			capturedOrchestration.push(task.orchestration);
			return {
				instanceId: `inst-${task.id}`,
				getState: () => ({
					instanceId: `inst-${task.id}`,
					taskId: task.id,
					definitionName: task.definition,
					state: "completed",
					startTime: 1,
					endTime: 2,
					turnCount: 1,
					lastActivityAt: 2,
					currentTool: null,
					error: null,
					toolCount: 0,
					currentToolStartedAt: null,
					durationMs: 1,
				}),
				start: async () => delegationResult(task, "completed", "done"),
			};
		},
		getInstances: () => [],
		removeInstance: () => {},
		getEventBus: () => ({ subscribe: () => () => {} }),
	} as any;

	const runner = new TaskRunner(runtime);
	await runner.run(
		fakeCtx({}) as any,
		{
			strategy: "sequential",
			tasks: [{ definition: "executor", title: "Simple task", prompt: "Implement the bounded change." }],
		},
		{ threadId: "main:test-session", toolCallId: "tool-1" },
	);

	assert.equal(capturedPrompts.length, 1);
	assert.ok(capturedPrompts[0].includes('mode="simple"'));
	assert.ok(capturedPrompts[0].includes("durable plan"));
	assert.ok(!capturedPrompts[0].includes("<plan "));
	assert.deepEqual(capturedOrchestration[0], {
		strategy: "simple",
	});
}

async function testTaskRunnerRejectsExecutorInPlanningPhase(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		const runner = new TaskRunner(runtime);

		await assert.rejects(
			() =>
				runner.run(
					fakeCtx({}) as any,
					{
						strategy: "sequential",
						tasks: [{ definition: "executor", title: "T-001: Task 1", prompt: "Implement the task." }],
					},
					{ threadId: "main:test-session", toolCallId: "tool-1" },
				),
			/lion-build/,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerForcesAnalyzerReadOnlyInPlanningPhase(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	const capturedTasks: DelegationTask[] = [];
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				capturedTasks.push(task);
				return {
					instanceId: `inst-${task.id}`,
					getState: () => ({
						instanceId: `inst-${task.id}`,
						taskId: task.id,
						definitionName: task.definition,
						state: "completed",
						startTime: 1,
						endTime: 2,
						turnCount: 1,
						lastActivityAt: 2,
						currentTool: null,
						error: null,
						toolCount: 0,
						currentToolStartedAt: null,
						durationMs: 1,
					}),
					start: async () => delegationResult(task, "completed", "analysis complete"),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		await runner.run(
			fakeCtx({}) as any,
			{
				strategy: "sequential",
				tasks: [
					{
						definition: "analyzer",
						title: "Analyze task",
						prompt: "Inspect the task.",
						capabilities: { canEdit: true, canWrite: true, canExecute: true },
					},
				],
			},
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(capturedTasks.length, 1);
		assert.deepEqual(capturedTasks[0].capabilities, {
			canEdit: false,
			canWrite: false,
			canExecute: false,
		});
		assert.deepEqual(capturedTasks[0].tools, ["read", "glob", "grep"]);
		assert.ok(capturedTasks[0].disabledTools?.includes("bash"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerAllowsValidatorInPlanningPhase(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		let capturedTask: DelegationTask | undefined;
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				capturedTask = task;
				return {
					instanceId: `instance-${task.id}`,
					start: () => Promise.resolve(delegationResult(task, "completed", "validated plan")),
					getState: () => delegationResult(task, "completed", "validated plan").finalState,
					dispose: () => Promise.resolve(),
					cancel: () => Promise.resolve(),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		await runner.run(
			fakeCtx({}) as any,
			{
				tasks: [
					{
						definition: "validator",
						title: "Validate active plan",
						prompt: "Validate the plan.",
						capabilities: { canEdit: true, canWrite: true, canExecute: true },
					},
				],
			},
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(capturedTask?.definition, "validator");
		assert.equal(capturedTask?.capabilities?.canEdit, false);
		assert.equal(capturedTask?.capabilities?.canWrite, false);
		assert.equal(capturedTask?.capabilities?.canExecute, false);
		assert.deepEqual(capturedTask?.tools, ["read", "glob", "grep"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerAllowsReviewerInPlanningPhase(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		let capturedTask: DelegationTask | undefined;
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				capturedTask = task;
				return {
					instanceId: `instance-${task.id}`,
					start: () => Promise.resolve(delegationResult(task, "completed", "reviewed plan")),
					getState: () => delegationResult(task, "completed", "reviewed plan").finalState,
					dispose: () => Promise.resolve(),
					cancel: () => Promise.resolve(),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		await runner.run(
			fakeCtx({}) as any,
			{
				tasks: [
					{
						definition: "reviewer",
						title: "Review active plan",
						prompt: "Review the plan.",
						capabilities: { canEdit: true, canWrite: true, canExecute: true },
					},
				],
			},
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(capturedTask?.definition, "reviewer");
		assert.equal(capturedTask?.capabilities?.canEdit, false);
		assert.equal(capturedTask?.capabilities?.canWrite, false);
		assert.equal(capturedTask?.capabilities?.canExecute, false);
		assert.deepEqual(capturedTask?.tools, ["read", "glob", "grep"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerRejectsReviewerInReviewPlanningPhase(): Promise<void> {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activateReview(plan);
	const runner = new TaskRunner(runtime);

	await assert.rejects(
		() =>
			runner.run(
				fakeCtx({}) as any,
				{
					strategy: "sequential",
					tasks: [
						{
							definition: "reviewer",
							title: "Review active changes",
							prompt: "Review the code.",
							capabilities: { canEdit: true, canWrite: true, canExecute: true },
							tools: ["read", "glob", "grep", "bash"],
						},
					],
				},
				{ threadId: "main:test-session", toolCallId: "tool-1" },
			),
		/lion-build in review mode/,
	);
}

async function testTaskRunnerRunsActivePlanNextTaskInBuildPhase(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		runtime.setPhase("building");
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				return {
					instanceId: `inst-${task.id}`,
					getState: () => ({
						instanceId: `inst-${task.id}`,
						taskId: task.id,
						definitionName: task.definition,
						state: "completed",
						startTime: 1,
						endTime: 2,
						turnCount: 1,
						lastActivityAt: 2,
						currentTool: null,
						error: null,
						toolCount: 0,
						currentToolStartedAt: null,
						durationMs: 1,
					}),
					start: async () => delegationResult(task, "completed", "bun run check passed"),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		const response = await runner.run(
			fakeCtx({}) as any,
			{ source: "active_plan_next_task", role: "executor", strategy: "sequential" },
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(response.nextTask?.id, "T-001");
		assert.equal(loadLionPlan(dir).tasks[0].status, "complete");
		assert.equal(runtime.state.activeTaskId, null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerBlocksActivePlanTaskWithoutStructuredResult(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		runtime.setPhase("building");
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				return {
					instanceId: `inst-${task.id}`,
					getState: () => ({
						instanceId: `inst-${task.id}`,
						taskId: task.id,
						definitionName: task.definition,
						state: "completed",
						startTime: 1,
						endTime: 2,
						turnCount: 1,
						lastActivityAt: 2,
						currentTool: null,
						error: null,
						toolCount: 0,
						currentToolStartedAt: null,
						durationMs: 1,
					}),
					start: async () => ({
						...delegationResult(task, "completed", "bun run check passed"),
						structuredResult: false,
					}),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		const response = await runner.run(
			fakeCtx({}) as any,
			{ source: "active_plan_next_task", role: "executor", strategy: "sequential" },
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(response.nextTask?.id, "T-001");
		assert.equal(loadLionPlan(dir).tasks[0].status, "retryable");
		assert.ok(readFileSync(join(dir, "checklist.json"), "utf-8").includes("structuredResult: false"));
		assert.equal(runtime.state.activeTaskId, null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerRejectsNonExecutorActivePlanSource(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		runtime.setPhase("building");
		const runner = new TaskRunner(runtime);

		await assert.rejects(
			() =>
				runner.run(
					fakeCtx({}) as any,
					{ source: "active_plan_next_task", role: "analyzer", strategy: "sequential" },
					{ threadId: "main:test-session", toolCallId: "tool-1" },
				),
			/only run executor/,
		);
		assert.equal(loadLionPlan(dir).tasks[0].status, "pending");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerEscapesActivePlanTaskPrompt(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist({ title: 'Fix <runtime> & "quotes"' });
	const capturedPrompts: string[] = [];
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		runtime.setPhase("building");
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				capturedPrompts.push(task.prompt);
				return {
					instanceId: `inst-${task.id}`,
					getState: () => ({
						instanceId: `inst-${task.id}`,
						taskId: task.id,
						definitionName: task.definition,
						state: "completed",
						startTime: 1,
						endTime: 2,
						turnCount: 1,
						lastActivityAt: 2,
						currentTool: null,
						error: null,
						toolCount: 0,
						currentToolStartedAt: null,
						durationMs: 1,
					}),
					start: async () => delegationResult(task, "completed", "done"),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		await runner.run(
			fakeCtx({}) as any,
			{ source: "active_plan_next_task", role: "executor", strategy: "sequential" },
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(capturedPrompts.length, 1);
		assert.ok(capturedPrompts[0].includes("Fix &lt;runtime&gt; &amp; &quot;quotes&quot;"));
		assert.ok(!capturedPrompts[0].includes('Fix <runtime> & "quotes"'));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerReturnsUpdatedPlanOnActivePlanFailure(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		runtime.setPhase("building");
		runtime.activeController = {
			createInstance() {
				throw new Error("controller failed");
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		const response = await runner.run(
			fakeCtx({}) as any,
			{ source: "active_plan_next_task", role: "executor", strategy: "sequential" },
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(response.nextTask?.id, "T-001");
		assert.equal(response.plan?.tasks[0].status, "blocked");
		assert.equal(loadLionPlan(dir).tasks[0].status, "blocked");
		assert.equal(runtime.state.activeTaskId, null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testTaskRunnerMarksDelegationLimitAsRetryable(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	const pi = fakePi();
	try {
		const runtime = new LionRuntime(pi as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		runtime.setPhase("building");
		runtime.activeController = {
			createInstance() {
				throw new Error("Delegation depth limit (3) reached. Cannot nest lion_tasks further.");
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;

		const runner = new TaskRunner(runtime);
		const response = await runner.run(
			fakeCtx({}) as any,
			{ source: "active_plan_next_task", role: "executor", strategy: "sequential" },
			{ threadId: "main:test-session", toolCallId: "tool-1" },
		);

		assert.equal(response.nextTask?.id, "T-001");
		assert.equal(response.plan?.tasks[0].status, "retryable");
		assert.equal(loadLionPlan(dir).tasks[0].status, "retryable");
		assert.equal(runtime.state.activeTaskId, null);
		assert.ok(pi.messages.some((message) => message.content.content.includes("Retry the current task")));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testLionBuildCommandRunsActivePlanToCompletion(): Promise<void> {
	const dir = createStructuredPlanDirWithDependentChecklist();
	const pi = fakePiWithCommands();
	const executedTasks: string[] = [];
	try {
		const runtime = new LionRuntime(pi as any, dir);
		runtime.activatePlan(loadLionPlan(dir));
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				executedTasks.push(task.description ?? "");
				return {
					instanceId: `inst-${task.id}`,
					getState: () => delegationResult(task, "completed", "bun run check passed").finalState,
					start: async () => delegationResult(task, "completed", "bun run check passed"),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;
		registerLionCommands(pi as any, runtime);

		await pi.commands.get("lion-build")!.handler("", fakeCtx({ cwd: dir }) as any);

		const updated = loadLionPlan(dir);
		assert.deepEqual(
			updated.tasks.map((item) => item.status),
			["complete", "complete"],
		);
		assert.deepEqual(executedTasks, ["T-001: Task 1", "T-002: Task 2"]);
		assert.equal(runtime.state.phase, "building");
		assert.equal(pi.messages[0].options.triggerTurn, false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testLionBuildCommandStopsOnRetryableTask(): Promise<void> {
	const dir = createStructuredPlanDirWithDependentChecklist();
	const pi = fakePiWithCommands();
	const executedTasks: string[] = [];
	try {
		const runtime = new LionRuntime(pi as any, dir);
		runtime.activatePlan(loadLionPlan(dir));
		runtime.activeController = {
			createInstance(task: DelegationTask) {
				executedTasks.push(task.description ?? "");
				return {
					instanceId: `inst-${task.id}`,
					getState: () => delegationResult(task, "completed", "summary without structured result").finalState,
					start: async () => ({
						...delegationResult(task, "completed", "summary without structured result"),
						structuredResult: false,
					}),
				};
			},
			getInstances: () => [],
			removeInstance: () => {},
			getEventBus: () => ({ subscribe: () => () => {} }),
		} as any;
		registerLionCommands(pi as any, runtime);

		await pi.commands.get("lion-build")!.handler("", fakeCtx({ cwd: dir }) as any);

		const updated = loadLionPlan(dir);
		assert.deepEqual(
			updated.tasks.map((item) => item.status),
			["retryable", "pending"],
		);
		assert.deepEqual(executedTasks, ["T-001: Task 1"]);
		assert.equal(runtime.state.activeTaskId, null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testStructuredPlanNextTaskRespectsDependencies(): void {
	const dir = createStructuredPlanDirWithDependentChecklist();
	try {
		const loaded = loadLionPlan(dir);
		const next = getNextExecutableTask(loaded);
		assert.equal(next?.id, "T-001");
		updateStructuredTaskStatus(loaded, "T-001", "complete");
		const updated = loadLionPlan(dir);
		assert.equal(getNextExecutableTask(updated)?.id, "T-002");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testStructuredPlanRecordTaskResultPersistsSummary(): void {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const loaded = loadLionPlan(dir);
		recordStructuredTaskResult(loaded, "T-001", "blocked", "Missing validation evidence");
		const updated = loadLionPlan(dir);
		assert.equal(updated.tasks[0].status, "blocked");
		const raw = readFileSync(join(dir, "checklist.json"), "utf-8");
		assert.ok(raw.includes("Missing validation evidence"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testLionTaskEvidenceRequiresValidation(): void {
	const result = delegationResult(
		{ id: "task-1", definition: "analyzer", prompt: "inspect" },
		"completed",
		"Implemented the requested change.",
	);

	const classified = classifyLionTaskResult(result);

	assert.equal(classified.verificationStatus, "unverified");
	assert.ok(classified.evidence.residualRisks.some((risk) => risk.includes("without explicit passing validation")));
}

function testLionTaskEvidenceDetectsHiddenErrors(): void {
	const result = delegationResult(
		{ id: "task-1", definition: "executor", prompt: "run tests" },
		"completed",
		"bun x vitest --run test/controller.test.ts passed\n[event-bus] wildcard listener error: RangeError: Maximum call stack size exceeded",
	);

	const classified = classifyLionTaskResult(result);

	assert.equal(classified.verificationStatus, "failed");
	assert.ok(classified.evidence.checks.length > 0);
}

function testLionTaskEvidenceUsesRecordedResult(): void {
	const result: DelegationResult = {
		...delegationResult(
			{ id: "task-1", definition: "executor", prompt: "implement" } as DelegationTask,
			"completed",
			"Done",
		),
		recordedResult: {
			status: "completed",
			summary: "Implemented the task",
			files: ["packages/subagents/src/instance.ts"],
			evidence: ["bun x tsx test/lion/workflow.test.ts passed"],
			risks: ["No residual risk"],
			nextStep: "Return to orchestrator",
		},
	};

	const classified = classifyLionTaskResult(result);

	assert.equal(classified.verificationStatus, "verified");
	assert.deepEqual(classified.evidence.changedFiles, ["packages/subagents/src/instance.ts"]);
	assert.ok(classified.evidence.checks.some((check) => check.detail?.includes("workflow.test.ts passed")));
	assert.ok(classified.evidence.warnings.includes("No residual risk"));
}

async function testLionActivatePlanToolKeepsPlanningPhase(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	const pi = fakePiWithTools();
	try {
		const runtime = new LionRuntime(pi as any, TEST_CWD);
		registerLionTools(runtime);
		const tool = pi.tools.get("lion_activate_plan");
		assert.ok(tool);

		const result = await tool.execute("tool-1", { reference: dir }, undefined, undefined, fakeCtx({}) as any);

		assert.equal(runtime.state.activePlanPath, dir);
		assert.equal(runtime.state.phase, "planning");
		assert.equal(result.details.plan.rootPath, dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testLionValidateCommandInjectsLionTasksPrompt(): Promise<void> {
	const dir = createStructuredPlanDirWithChecklist();
	const pi = fakePiWithCommands();
	try {
		const runtime = new LionRuntime(pi as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(dir));
		pi.messages.length = 0;
		registerLionCommands(pi as any, runtime);

		await pi.commands.get("lion-validate")!.handler("acceptance criteria", fakeCtx({}) as any);

		const injected = pi.messages.find((message) => message.content?.customType === "lion-orchestrator-feedback");
		assert.ok(injected);
		assert.deepEqual(injected.options, { triggerTurn: true });
		assert.deepEqual(injected.content.details.nextTools, ["lion_tasks"]);
		assert.equal(injected.content.details.role, "validator");
		assert.ok(injected.content.content.includes("Use lion_tasks with one explicit validator delegation"));
		assert.ok(injected.content.content.includes("Do not implement application code."));
		assert.ok(injected.content.content.includes("Focus: acceptance criteria"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

async function testLionReviewCommandCreatesPlanReviewPipeline(): Promise<void> {
	const planDir = createStructuredPlanDirWithChecklist();
	const cwd = mkdtempSync(join(tmpdir(), "lion-review-command-"));
	const pi = fakePiWithCommands();
	try {
		const runtime = new LionRuntime(pi as any, TEST_CWD);
		runtime.activatePlan(loadLionPlan(planDir));
		pi.messages.length = 0;
		registerLionCommands(pi as any, runtime);

		await pi.commands.get("lion-review")!.handler("focus regressions", fakeCtx({ cwd }) as any);

		const injected = pi.messages.find((message) => message.content?.customType === "lion-orchestrator-feedback");
		assert.ok(injected);
		assert.deepEqual(injected.options, { triggerTurn: true });
		assert.equal(runtime.state.strategy, "review");
		assert.equal(runtime.state.phase, "planning");
		assert.ok(runtime.state.activePlanPath?.startsWith(join(cwd, ".reviews")));
		assert.deepEqual(injected.content.details.nextToolsRequired, ["lion_checklist_start_next"]);
		assert.deepEqual(injected.content.details.nextTools, ["lion_checklist_start_next", "lion_tasks"]);
		assert.equal(injected.content.details.sourcePlanPath, planDir);
		assert.ok(injected.content.content.includes("Lion plan review pipeline created."));
		assert.ok(injected.content.content.includes("Source plan:"));
		assert.ok(injected.content.content.includes("Focus: focus regressions"));
	} finally {
		rmSync(planDir, { recursive: true, force: true });
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testLionReviewCommandRequiresActivePlan(): Promise<void> {
	const pi = fakePiWithCommands();
	const runtime = new LionRuntime(pi as any, TEST_CWD);
	registerLionCommands(pi as any, runtime);

	await pi.commands.get("lion-review")!.handler("", fakeCtx({}) as any);

	assert.equal(runtime.state.strategy, "none");
	assert.equal(runtime.state.activePlanPath, null);
}

function testLionToolsRegisterPlanActivationAndDelegationOnly(): void {
	const pi = fakePiWithTools();
	const runtime = new LionRuntime(pi as any, TEST_CWD);
	registerLionTools(runtime);

	assert.deepEqual([...pi.tools.keys()].sort(), [
		"lion_activate_plan",
		"lion_checklist_read",
		"lion_checklist_record",
		"lion_checklist_start_next",
		"lion_tasks",
	]);
}

function testLionDashboardUrlUsesStatusOnly(): void {
	const pi = fakePi();
	const runtime = new LionRuntime(pi as any, TEST_CWD);
	const statusUpdates: Array<{ key: string; value: string | undefined }> = [];
	const ctx = fakeCtx({ hasUI: true, statusUpdates });

	runtime.ui.showDashboardUrl(ctx as any, new URL("http://127.0.0.1:4321/"));

	assert.equal(pi.messages.length, 0);
	assert.deepEqual(statusUpdates, [{ key: "lion-dashboard", value: "Dashboard http://127.0.0.1:4321/" }]);
}

async function testLionExtensionDoesNotGuardWhenInactive(): Promise<void> {
	const handlers = new Map<string, Array<(event: ToolCallEvent, ctx?: unknown) => unknown>>();
	const pi = {
		on(type: string, handler: (event: ToolCallEvent, ctx?: unknown) => unknown) {
			const existing = handlers.get(type) ?? [];
			existing.push(handler);
			handlers.set(type, existing);
		},
		registerTool() {},
		registerCommand() {},
		appendEntry() {},
		sendMessage() {},
	};

	lionExtension(pi as any);
	const [handler] = handlers.get("tool_call") ?? [];
	assert.ok(handler);

	const result = await handler({
		type: "tool_call",
		toolName: "edit",
		toolCallId: "tool-1",
		input: { path: "packages/subagents/src/index.ts" },
	});

	assert.equal(result, undefined);
}

function testDelegationGuardTurnCompatibilityMethods(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	assert.equal(runtime.delegationGuard.startTurn(), undefined);
	assert.equal(runtime.delegationGuard.endTurn(), undefined);
}

function testDelegationGuardAllowsStructureProbes(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	for (let i = 0; i < 3; i++) {
		const result = runtime.delegationGuard.handleToolCall(lsToolCall(`packages/subagents/src/area-${i}`));
		assert.equal(result, undefined);
	}
}

function testDelegationGuardAllowsReads(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	const result = runtime.delegationGuard.handleToolCall(readToolCall("packages/subagents/src/file.ts"));

	assert.equal(result, undefined);
}

function testDelegationGuardAllowsUnlimitedStructureProbes(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	for (let i = 0; i < 3; i++) {
		runtime.delegationGuard.handleToolCall(lsToolCall(`packages/subagents/src/area-${i}`));
	}
	const result = runtime.delegationGuard.handleToolCall(lsToolCall("packages/subagents/src/area-4"));

	assert.equal(result, undefined);
}

function testDelegationGuardAllowsAfterLionTasks(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	runtime.delegationGuard.handleToolCall({
		type: "tool_call",
		toolName: "lion_tasks",
		toolCallId: "tool-1",
		input: {},
	});
	const result = runtime.delegationGuard.handleToolCall(readToolCall("packages/subagents/src/file.ts"));

	assert.equal(result, undefined);
}

function testDelegationGuardReleasesLionTasksOnToolResult(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	const first = runtime.delegationGuard.handleToolCall(lionTasksToolCall("tool-1"));
	assert.equal(first, undefined);
	assert.equal(runtime.delegationGuard.getDepth("main"), 1);

	runtime.delegationGuard.handleToolResult(lionTasksToolResult("tool-1"));

	assert.equal(runtime.delegationGuard.getDepth("main"), 0);
}

function testDelegationGuardAllowsSequentialTopLevelLionTasks(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	for (let i = 0; i < 5; i++) {
		const toolCallId = `tool-${i}`;
		const result = runtime.delegationGuard.handleToolCall(lionTasksToolCall(toolCallId));
		assert.equal(result, undefined);
		runtime.delegationGuard.handleToolResult(lionTasksToolResult(toolCallId));
	}

	assert.equal(runtime.delegationGuard.getDepth("main"), 0);
}

function testDelegationGuardBlocksActualNestedLionTasks(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	for (let i = 0; i < 3; i++) {
		const result = runtime.delegationGuard.handleToolCall(lionTasksToolCall(`nested-${i}`));
		assert.equal(result, undefined);
	}
	const blocked = runtime.delegationGuard.handleToolCall(lionTasksToolCall("nested-3"));

	assert.equal(blocked?.block, true);
	assert.match(blocked?.reason ?? "", /Delegation depth limit/);
}

function testDelegationGuardAllowsDirectEdits(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	const result = runtime.delegationGuard.handleToolCall({
		type: "tool_call",
		toolName: "edit",
		toolCallId: "tool-1",
		input: { path: "packages/subagents/src/index.ts" },
	});

	assert.equal(result, undefined);
}

function testDelegationGuardAllowsPlanReads(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	for (let i = 0; i < 8; i++) {
		const result = runtime.delegationGuard.handleToolCall(readToolCall(`.plans/lion/tasks/T-00${i}.md`));
		assert.equal(result, undefined);
	}
}

function testDelegationGuardAllowsPlanEdits(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	const result = runtime.delegationGuard.handleToolCall({
		type: "tool_call",
		toolName: "edit",
		toolCallId: "tool-1",
		input: { path: ".plans/lion/context.md" },
	});

	assert.equal(result, undefined);
}

function testDelegationGuardAllowsPlanMultiEdits(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	const result = runtime.delegationGuard.handleToolCall({
		type: "tool_call",
		toolName: "edit",
		toolCallId: "tool-1",
		input: {
			multi: [
				{ path: ".plans/lion/tasks/T-001.md", oldText: "old", newText: "new" },
				{ path: ".plans/lion/tasks/T-002.md", oldText: "old", newText: "new" },
			],
		},
	});

	assert.equal(result, undefined);
}

function testDelegationGuardBlocksPlanChecklistReads(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	const result = runtime.delegationGuard.handleToolCall(readToolCall(".plans/lion/checklist.json"));

	assert.equal(result?.block, true);
	assert.match(result?.reason ?? "", /lion_checklist_read/);
}

function testDelegationGuardBlocksReviewChecklistEdits(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	const result = runtime.delegationGuard.handleToolCall({
		type: "tool_call",
		toolName: "edit",
		toolCallId: "tool-1",
		input: { path: ".reviews/lion-review/checklist.json" },
	});

	assert.equal(result?.block, true);
	assert.match(result?.reason ?? "", /lion_checklist_start_next/);
}

function testDelegationGuardBlocksChecklistMultiEdits(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlanning();

	const result = runtime.delegationGuard.handleToolCall({
		type: "tool_call",
		toolName: "multi-edit",
		toolCallId: "tool-1",
		input: {
			edits: [
				{ path: ".plans/lion/tasks/T-001.md", oldText: "old", newText: "new" },
				{ path: ".plans/lion/checklist.json", oldText: "old", newText: "new" },
			],
		},
	});

	assert.equal(result?.block, true);
	assert.match(result?.reason ?? "", /Direct multi-edit access/);
}

function testWidgetLinesWithNoJobs(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const lines = buildLionSubagentWidgetLines(runtime.subagentUi.values(), plainTheme as any);
	assert.equal(lines.length, 0);
}

function testWidgetLinesWithJobs(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	const lines = buildLionSubagentWidgetLines(runtime.subagentUi.values(), plainTheme as any);
	assert.ok(lines.some((line) => line.includes("Build auth")));
}

function testWidgetLinesWithCompletedJob(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	const result = delegationResult(
		{ id: "task-1", definition: "coder", prompt: "do it" } as DelegationTask,
		"completed",
		"done",
	);
	runtime.recordSubagentUiEvent({
		type: "task.end",
		instanceId: "inst-1",
		taskId: "task-1",
		result,
		timestamp: Date.now(),
	});
	const lines = buildLionSubagentWidgetLines(runtime.subagentUi.values(), plainTheme as any);
	assert.ok(lines.some((line) => line.includes("Build auth")));
}

function testWidgetLinesWithFailedJob(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "error",
		instanceId: "inst-1",
		taskId: "task-1",
		error: "error",
		fatal: true,
		timestamp: Date.now(),
	});
	const lines = buildLionSubagentWidgetLines(runtime.subagentUi.values(), plainTheme as any);
	assert.ok(lines.some((line) => line.includes("Build auth")));
}

function testWidgetLinesHidesProgressDetails(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.subagentUi.set("task-1", {
		runId: "run-1",
		taskId: "task-1",
		instanceId: "inst-1",
		role: "executor",
		title: "Build auth",
		status: "running",
		turnCount: 3,
		toolCount: 5,
		currentTool: "edit_file",
		summary: "Working on auth",
		startedAt: Date.now(),
		updatedAt: Date.now(),
		completedAt: null,
	});
	const lines = buildLionSubagentWidgetLines(runtime.subagentUi.values(), plainTheme as any);
	assert.ok(lines.some((line) => line.includes("Build auth")));
	assert.ok(!lines.some((line) => line.includes("edit_file")));
	assert.ok(!lines.some((line) => line.includes("Working on auth")));
	assert.ok(!lines.some((line) => line.includes("turn")));
	assert.ok(!lines.some((line) => line.includes("tool use")));
}

function testWidgetLinesFitInPanel(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	for (let i = 0; i < 10; i++) {
		runtime.startJob({ runId: "run-1", taskId: `task-${i}`, role: "executor", title: `Job ${i}` });
	}
	const lines = buildLionSubagentWidgetLines(runtime.subagentUi.values(), plainTheme as any);
	const maxWidth = 60;
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= maxWidth,
			`Line exceeds ${maxWidth} chars: "${line}" (width: ${visibleWidth(line)})`,
		);
	}
}

function testWidgetCleanupRemovesOldCompleted(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const now = Date.now();
	runtime.startJob({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Old job",
		timestamp: now - 20000,
	});
	runtime.finishJob(
		"task-1",
		delegationResult({ id: "task-1", definition: "coder", prompt: "do it" } as DelegationTask, "completed", "done"),
	);
	runtime.startSubagentUi({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Old job",
		timestamp: now - 20000,
	});
	runtime.subagentUi.get("task-1")!.completedAt = now - 20000;

	runtime.cleanupSubagentUi(now, 5000);
	assert.equal(runtime.subagentUi.has("task-1"), false);
}

function testWidgetCleanupKeepsRecentCompleted(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const now = Date.now();
	runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Recent job" });
	runtime.finishJob(
		"task-1",
		delegationResult({ id: "task-1", definition: "coder", prompt: "do it" } as DelegationTask, "completed", "done"),
	);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Recent job" });

	runtime.cleanupSubagentUi(now, 5000);
	assert.equal(runtime.subagentUi.has("task-1"), true);
}

function testWidgetCleanupKeepsRunning(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const now = Date.now();
	runtime.startJob({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Running job",
		timestamp: now - 1000000,
	});
	runtime.startSubagentUi({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Running job",
		timestamp: now - 1000000,
	});
	runtime.subagentUi.get("task-1")!.status = "running";

	runtime.cleanupSubagentUi(now, 5000);
	assert.equal(runtime.subagentUi.has("task-1"), true);
}

function testWidgetCleanupRemovesOrphanedQueued(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const now = Date.now();
	runtime.startJob({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Orphaned",
		timestamp: now - 400000,
	});
	runtime.startSubagentUi({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Orphaned",
		timestamp: now - 400000,
	});

	runtime.cleanupSubagentUi(now, 5000);
	assert.equal(runtime.subagentUi.has("task-1"), false);
}

function testWidgetCleanupKeepsRecentQueued(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const now = Date.now();
	runtime.startJob({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Recent queued",
		timestamp: now - 1000,
	});
	runtime.startSubagentUi({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Recent queued",
		timestamp: now - 1000,
	});

	runtime.cleanupSubagentUi(now, 5000);
	assert.equal(runtime.subagentUi.has("task-1"), true);
}

function testChecklistFileRoundTrip(): void {
	const dir = mkdtempSync(join(tmpdir(), "lion-checklist-"));
	try {
		const checklistPath = join(dir, "checklist.json");
		writeFileSync(
			checklistPath,
			JSON.stringify({
				completed: 0,
				total_tasks: 1,
				tasks: [{ id: "T-001", title: "Task 1", status: "pending", dependencies: [], requirements: [] }],
			}),
		);
		const file = new LionChecklistFile(checklistPath);
		const tasks = file.loadTasks();
		assert.equal(tasks[0].status, "pending");
		file.updateTaskStatus("T-001", "complete");
		const updated = file.loadTasks();
		assert.equal(updated[0].status, "complete");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testChecklistFileUpdateNonExistentTask(): void {
	const dir = mkdtempSync(join(tmpdir(), "lion-checklist-"));
	try {
		const checklistPath = join(dir, "checklist.json");
		writeFileSync(
			checklistPath,
			JSON.stringify({
				completed: 0,
				total_tasks: 0,
				tasks: [],
			}),
		);
		const file = new LionChecklistFile(checklistPath);
		assert.throws(() => file.updateTaskStatus("T-999", "complete"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testChecklistFileLoadTasks(): void {
	const dir = mkdtempSync(join(tmpdir(), "lion-checklist-"));
	try {
		const checklistPath = join(dir, "checklist.json");
		writeFileSync(
			checklistPath,
			JSON.stringify({
				completed: 1,
				total_tasks: 2,
				tasks: [
					{ id: "T-001", title: "Task 1", status: "complete", dependencies: [], requirements: [] },
					{ id: "T-002", title: "Task 2", status: "pending", dependencies: ["T-001"], requirements: [] },
				],
			}),
		);
		const file = new LionChecklistFile(checklistPath);
		const tasks = file.loadTasks();
		assert.equal(tasks.length, 2);
		assert.equal(tasks[0].id, "T-001");
		assert.deepEqual(tasks[1].dependencies, ["T-001"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testChecklistFileLoadTasksWithRequirements(): void {
	const dir = mkdtempSync(join(tmpdir(), "lion-checklist-"));
	try {
		const checklistPath = join(dir, "checklist.json");
		writeFileSync(
			checklistPath,
			JSON.stringify({
				completed: 0,
				total_tasks: 1,
				tasks: [
					{
						id: "T-001",
						title: "Task 1",
						status: "pending",
						dependencies: [],
						requirements: ["req-1", "req-2"],
					},
				],
			}),
		);
		const file = new LionChecklistFile(checklistPath);
		const tasks = file.loadTasks();
		assert.deepEqual(tasks[0].requirements, ["req-1", "req-2"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testChecklistFileRunningMapsToInProgress(): void {
	const dir = mkdtempSync(join(tmpdir(), "lion-checklist-"));
	try {
		const checklistPath = join(dir, "checklist.json");
		writeFileSync(
			checklistPath,
			JSON.stringify({
				completed: 0,
				total_tasks: 1,
				tasks: [{ id: "T-001", title: "Task 1", status: "running", dependencies: [], requirements: [] }],
			}),
		);
		const file = new LionChecklistFile(checklistPath);
		const tasks = file.loadTasks();
		assert.equal(tasks[0].status, "in_progress");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testStructuredPlanFileRoundTrip(): void {
	const dir = createStructuredPlanDir();
	try {
		const file = new StructuredLionPlanFile(dir);
		const loaded = file.loadPlan();
		assert.equal(loaded.slug, "plan");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testStructuredPlanFileLoadMissing(): void {
	const dir = mkdtempSync(join(tmpdir(), "lion-structured-"));
	try {
		const file = new StructuredLionPlanFile(dir);
		assert.throws(() => file.loadPlan(), /Required plan file missing/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testStructuredPlanFileMarkTaskComplete(): void {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const file = new StructuredLionPlanFile(dir);
		const plan = file.loadPlan();
		file.markTaskComplete(plan, "T-001");
		const reloaded = file.loadPlan();
		assert.equal(reloaded.tasks[0].status, "complete");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testStructuredPlanFileMarkNonExistentTask(): void {
	const dir = createStructuredPlanDirWithChecklist();
	try {
		const file = new StructuredLionPlanFile(dir);
		const plan = file.loadPlan();
		assert.throws(() => file.markTaskComplete(plan, "T-999"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testResolvePlanPath(): void {
	const dir = mkdtempSync(join(tmpdir(), "lion-resolve-abspath-"));
	try {
		mkdirSync(join(dir, "tasks"), { recursive: true });
		writeFileSync(join(dir, "context.md"), "# Context");
		writeFileSync(join(dir, "requirements.md"), "# Requirements");
		writeFileSync(join(dir, "task-index.md"), "# Test Plan\n## T-001\nStatus: pending");
		const spf = new StructuredLionPlanFile(dir);
		const plan = spf.loadPlan();
		assert.equal(plan.slug, "plan");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testResolvePlanPathWithDir(): void {
	const dir = mkdtempSync(join(tmpdir(), "lion-resolve-"));
	try {
		mkdirSync(join(dir, "plans", "test", "tasks"), { recursive: true });
		writeFileSync(join(dir, "plans", "test", "context.md"), "# Test Context");
		writeFileSync(join(dir, "plans", "test", "requirements.md"), "# Test Requirements");
		writeFileSync(join(dir, "plans", "test", "task-index.md"), "# Test");
		const file = new StructuredLionPlanFile(join(dir, "plans", "test"));
		const plan = file.loadPlan();
		assert.equal(plan.slug, "plan");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function testRuntimeRestoreState(): void {
	const cwd = mkdtempSync(join(tmpdir(), "lion-restore-"));
	try {
		writeLionState(
			cwd,
			{
				version: 2,
				active: true,
				strategy: "plan",
				phase: "planning",
				activePlanPath: "/tmp/plan",
				activePlanSlug: "plan",
				planKind: "structured",
				activeTaskId: null,
				maxAttempts: 3,
				lastRunId: null,
			},
			createLionCore(),
			"test-session",
		);
		const runtime = new LionRuntime(fakePi() as any, cwd);
		runtime.restore(fakeCtx({ cwd }) as any);
		assert.equal(runtime.state.active, true);
		assert.equal(runtime.state.strategy, "plan");
		assert.equal(runtime.state.phase, "planning");
		assert.equal(runtime.state.activePlanSlug, "plan");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testRuntimeRestoreStateIgnoresOtherSession(): void {
	const cwd = mkdtempSync(join(tmpdir(), "lion-restore-other-session-"));
	try {
		writeLionState(
			cwd,
			{
				version: 2,
				active: true,
				strategy: "plan",
				phase: "planning",
				activePlanPath: "/tmp/plan",
				activePlanSlug: "plan",
				planKind: "structured",
				activeTaskId: null,
				maxAttempts: 3,
				lastRunId: null,
			},
			createLionCore(),
			"previous-session",
		);
		const runtime = new LionRuntime(fakePi() as any, cwd);
		runtime.restore(fakeCtx({ cwd, sessionId: "new-session" }) as any);
		assert.equal(runtime.state.active, false);
		assert.equal(runtime.state.strategy, "none");
		assert.equal(runtime.state.activePlanSlug, null);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testRuntimeRestoreStateIgnoresOwnerlessActiveDocument(): void {
	const cwd = mkdtempSync(join(tmpdir(), "lion-restore-ownerless-"));
	try {
		const statePath = getLionStatePath(cwd);
		mkdirSync(join(cwd, ".pi", "lion"), { recursive: true });
		writeFileSync(
			statePath,
			JSON.stringify({
				version: 3,
				state: {
					version: 2,
					active: true,
					strategy: "plan",
					phase: "planning",
					activePlanPath: "/tmp/plan",
					activePlanSlug: "plan",
					planKind: "structured",
					activeTaskId: null,
					maxAttempts: 3,
					lastRunId: null,
				},
				core: createLionCore(),
				updatedAt: Date.now(),
			}),
		);
		const runtime = new LionRuntime(fakePi() as any, cwd);
		runtime.restore(fakeCtx({ cwd }) as any);
		assert.equal(runtime.state.active, false);
		assert.equal(runtime.state.strategy, "none");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testRuntimeRestoreStateIgnoresLegacyVersion(): void {
	const cwd = mkdtempSync(join(tmpdir(), "lion-restore-legacy-"));
	try {
		// Write a version 1 document (should be treated as invalid)
		const statePath = getLionStatePath(cwd);
		mkdirSync(join(cwd, ".pi", "lion"), { recursive: true });
		writeFileSync(
			statePath,
			JSON.stringify({
				version: 1,
				state: { version: 1, active: true },
				core: { activeRun: null, runHistory: [] },
				updatedAt: Date.now(),
			}),
		);
		const runtime = new LionRuntime(fakePi() as any, cwd);
		runtime.restore(fakeCtx({ cwd }) as any);
		assert.equal(runtime.state.active, false);
		assert.equal(runtime.state.strategy, "none");
		assert.equal(runtime.state.phase, "planning");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testRuntimeRestoreStateInvalidVersion(): void {
	const cwd = mkdtempSync(join(tmpdir(), "lion-restore-invalid-"));
	try {
		const statePath = getLionStatePath(cwd);
		mkdirSync(join(cwd, ".pi", "lion"), { recursive: true });
		writeFileSync(
			statePath,
			JSON.stringify({
				version: 999,
				state: {},
				core: {},
				updatedAt: Date.now(),
			}),
		);
		const runtime = new LionRuntime(fakePi() as any, cwd);
		runtime.restore(fakeCtx({ cwd }) as any);
		assert.equal(runtime.state.active, false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testRuntimeRestoreStateNoEntries(): void {
	const cwd = mkdtempSync(join(tmpdir(), "lion-restore-empty-"));
	try {
		const runtime = new LionRuntime(fakePi() as any, cwd);
		runtime.restore(fakeCtx({ cwd, entries: [] }) as any);
		assert.equal(runtime.state.active, false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testRuntimePersist(): void {
	const cwd = mkdtempSync(join(tmpdir(), "lion-persist-"));
	try {
		const runtime = new LionRuntime(fakePi() as any, cwd);
		runtime.restore(fakeCtx({ cwd, sessionId: "persist-session" }) as any);
		runtime.activatePlanning();
		runtime.persist();
		const saved = readLionState(cwd, fakeCtx({ cwd, sessionId: "persist-session" }) as any);
		assert.ok(saved);
		assert.equal(saved.state.active, true);
		assert.equal(saved.state.strategy, "plan");
		assert.equal(saved.state.phase, "planning");
		assert.equal(readLionState(cwd, fakeCtx({ cwd, sessionId: "other-session" }) as any), null);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testRuntimeEmit(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const events: any[] = [];
	runtime.events.on("lion.activate.start", (event) => events.push(event));
	runtime.emit({ type: "lion.activate.start", timestamp: 1, runId: "run-1", input: "test" });
	assert.equal(events.length, 1);
	assert.equal(events[0].runId, "run-1");
}

function testRuntimeRetainAndRelease(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.retainSubagent({ runId: "run-1", role: "executor", taskId: "task-1" });
	assert.ok(runtime.retainedInstances.has("task-1"));
	runtime.releaseRun("run-1");
	assert.ok(!runtime.retainedInstances.has("task-1"));
}

function testRuntimeRetainMultipleSameRun(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.retainSubagent({ runId: "run-1", role: "executor", taskId: "task-1" });
	runtime.retainSubagent({ runId: "run-1", role: "reviewer", taskId: "task-2" });
	assert.equal(runtime.retainedInstances.size, 2);
	runtime.releaseRun("run-1");
	assert.equal(runtime.retainedInstances.size, 0);
}

function testRuntimeCreateSubAgentController(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const ctx = fakeCtx({}) as any;
	const controller = runtime.createSubAgentController(ctx, "run-1");
	assert.ok(controller);
	assert.equal(runtime.activeRunId, "run-1");
	assert.ok(runtime.controllers.has("run-1"));
}

function testRuntimeEnsureControllerReturnsSame(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const ctx = fakeCtx({}) as any;
	const c1 = runtime.ensureController(ctx);
	const c2 = runtime.ensureController(ctx);
	assert.equal(c1, c2);
}

function testRuntimeSetMode(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.setPhase("building");
	assert.equal(runtime.state.phase, "building");
	assert.equal(runtime.state.active, true);
}

function testRuntimeActivateSimple(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlan(plan);
	runtime.activateSimple();
	assert.equal(runtime.state.active, true);
	assert.equal(runtime.state.strategy, "simple");
	assert.equal(runtime.state.phase, "building");
	assert.equal(runtime.state.activePlanPath, null);
	assert.equal(runtime.state.activePlanSlug, null);
	assert.equal(runtime.state.planKind, null);
}

function testRuntimeActivatePlanningClearsPreviousPlan(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activatePlan(plan);
	runtime.setPhase("building");
	runtime.setActiveTask("T-001");
	runtime.setLastRun("run-1");

	runtime.activatePlanning();

	assert.equal(runtime.state.active, true);
	assert.equal(runtime.state.strategy, "plan");
	assert.equal(runtime.state.phase, "planning");
	assert.equal(runtime.state.activePlanPath, null);
	assert.equal(runtime.state.activePlanSlug, null);
	assert.equal(runtime.state.planKind, null);
	assert.equal(runtime.state.activeTaskId, null);
	assert.equal(runtime.state.lastRunId, null);
}

async function testLionActivateCommandWithoutReferenceStartsFreshPlanning(): Promise<void> {
	const pi = fakePiWithCommands();
	const runtime = new LionRuntime(pi as any, TEST_CWD);
	runtime.activatePlan(plan);
	registerLionCommands(pi as any, runtime);

	await pi.commands.get("lion-activate")!.handler("", fakeCtx({}) as any);

	assert.equal(runtime.state.active, true);
	assert.equal(runtime.state.strategy, "plan");
	assert.equal(runtime.state.phase, "planning");
	assert.equal(runtime.state.activePlanSlug, null);
	assert.equal(runtime.state.activePlanPath, null);
	const feedback = pi.messages.find((message) => message.content.customType === "lion-orchestrator-feedback");
	assert.ok(feedback);
	assert.ok(feedback.content.content.includes("create a new structured plan"));
	assert.ok(
		feedback.content.content.includes("Do not activate an existing plan unless the user names a plan reference"),
	);
	assert.equal(feedback.content.details.planSlug, null);
}

async function testLionSimpleCommandActivatesSimpleStrategy(): Promise<void> {
	const pi = fakePiWithCommands();
	const runtime = new LionRuntime(pi as any, TEST_CWD);
	registerLionCommands(pi as any, runtime);

	await pi.commands.get("lion-simple")!.handler("packages/subagents", fakeCtx({}) as any);

	assert.equal(runtime.state.active, true);
	assert.equal(runtime.state.strategy, "simple");
	assert.equal(runtime.state.phase, "building");
	assert.equal(runtime.state.activePlanPath, null);
	assert.ok(pi.messages.some((message) => message.content.content.includes("Lion simple mode active")));
}

async function testRuntimeCompactionInstructionsUseStrategy(): Promise<void> {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.activateSimple();
	const simple = await runtime.buildCompactionInstructions(fakeCtx({}) as any);
	assert.ok(simple?.includes("Lion simple orchestration is active"));
	assert.ok(simple?.includes("Strategy: simple"));
	assert.ok(simple?.includes("Completion gate: use structured subagent results"));
	assert.ok(simple?.includes("Next orchestration step:"));
	assert.ok(!simple?.includes("Active plan path"));

	runtime.activatePlan(plan);
	const durable = await runtime.buildCompactionInstructions(fakeCtx({}) as any);
	assert.ok(durable?.includes("Lion durable plan orchestration is active"));
	assert.ok(durable?.includes("Active plan path: /tmp/test-plan"));
	assert.ok(durable?.includes("Completion gate: active plan tasks require"));
	assert.ok(durable?.includes("Next orchestration step:"));
}

function testRuntimeSetActiveTask(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.setActiveTask("T-001");
	assert.equal(runtime.state.activeTaskId, "T-001");
}

function testRuntimeSetLastRun(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.setLastRun("run-1");
	assert.equal(runtime.state.lastRunId, "run-1");
}

function testRuntimeApplyBuildResult(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const result = { status: "approved" as const, summary: "Done", taskId: "T-001", attempts: 1 };
	runtime.applyBuildResult(result);
	assert.equal(runtime.state.phase, "planning");
	assert.equal(runtime.state.activeTaskId, null);
	assert.deepEqual(runtime.state.lastBuild, result);
}

function testRuntimeQueueFeedbackWhenIdle(): void {
	const pi = fakePi();
	const runtime = new LionRuntime(pi as any, TEST_CWD);
	const ctx = fakeCtx({ isIdle: true, hasPending: false }) as any;
	runtime.queueFeedback(ctx, "test", { foo: 1 });
	assert.equal(pi.messages.length, 1);
	assert.equal(pi.messages[0].content.content, "test");
}

function testRuntimeQueueFeedbackWhenBusy(): void {
	const pi = fakePi();
	const runtime = new LionRuntime(pi as any, TEST_CWD);
	const ctx = fakeCtx({ isIdle: false, hasPending: false }) as any;
	runtime.queueFeedback(ctx, "test", { foo: 1 });
	assert.equal(pi.messages.length, 1);
	assert.equal(pi.messages[0].options.deliverAs, "followUp");
}

function testRuntimeQueueFeedbackSkipsWhenPending(): void {
	const pi = fakePi();
	const runtime = new LionRuntime(pi as any, TEST_CWD);
	const ctx = fakeCtx({ isIdle: true, hasPending: true }) as any;
	runtime.queueFeedback(ctx, "test", { foo: 1 });
	assert.equal(pi.messages.length, 1);
	assert.equal(pi.messages[0].options.deliverAs, "followUp");
}

function testRuntimeGetSubagentHealth(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Job 1", timestamp: 1 });
	runtime.startJob({ runId: "run-1", taskId: "task-2", role: "reviewer", title: "Job 2", timestamp: 2 });
	const health = runtime.getSubagentHealth();
	assert.equal(health.length, 2);
	assert.equal(health[0].title, "Job 2"); // sorted by updatedAt desc
}

function testRuntimeGetSubagentHealthByTaskId(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Job 1" });
	runtime.startJob({ runId: "run-1", taskId: "task-2", role: "reviewer", title: "Job 2" });
	const health = runtime.getSubagentHealth("task-1");
	assert.equal(health.length, 1);
	assert.equal(health[0].title, "Job 1");
}

function testRuntimeRecordSubagentUiEvent(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "task.start",
		instanceId: "inst-1",
		taskId: "task-1",
		definitionName: "coder",
		description: "Building auth",
		timestamp: Date.now(),
	});
	const ui = runtime.subagentUi.get("task-1");
	assert.equal(ui?.status, "running");
	assert.equal(ui?.title, "Building auth");
}

function testRuntimeRecordSubagentUiEventTurnComplete(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "turn.complete",
		instanceId: "inst-1",
		taskId: "task-1",
		turnIndex: 2,
		toolCount: 3,
		hadError: false,
		timestamp: Date.now(),
	});
	const ui = runtime.subagentUi.get("task-1");
	assert.equal(ui?.turnCount, 3);
	assert.equal(ui?.toolCount, 3);
}

function testRuntimeRecordSubagentUiEventToolStart(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "tool.start",
		instanceId: "inst-1",
		taskId: "task-1",
		toolName: "edit_file",
		toolCallId: "tc-1",
		timestamp: Date.now(),
	});
	const ui = runtime.subagentUi.get("task-1");
	assert.equal(ui?.currentTool, "edit_file");
}

function testRuntimeRecordSubagentUiEventToolEnd(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "tool.start",
		instanceId: "inst-1",
		taskId: "task-1",
		toolName: "edit_file",
		toolCallId: "tc-1",
		timestamp: Date.now(),
	});
	runtime.recordSubagentUiEvent({
		type: "tool.end",
		instanceId: "inst-1",
		taskId: "task-1",
		toolName: "edit_file",
		toolCallId: "tc-1",
		isError: false,
		timestamp: Date.now(),
	});
	const ui = runtime.subagentUi.get("task-1");
	assert.equal(ui?.currentTool, null);
}

function testRuntimeRecordSubagentUiEventProgress(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "progress.update",
		instanceId: "inst-1",
		taskId: "task-1",
		message: "Making progress",
		timestamp: Date.now(),
	});
	const ui = runtime.subagentUi.get("task-1");
	assert.equal(ui?.summary, "Making progress");
}

function testRuntimeRecordSubagentUiEventTaskEnd(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "task.end",
		instanceId: "inst-1",
		taskId: "task-1",
		result: delegationResult(
			{ id: "task-1", definition: "coder", prompt: "do it" } as DelegationTask,
			"completed",
			"done",
		),
		timestamp: Date.now(),
	});
	const ui = runtime.subagentUi.get("task-1");
	assert.equal(ui?.status, "completed");
	assert.equal(ui?.summary, "done");
	assert.equal(ui?.turnCount, 1);
}

function testRuntimeRecordSubagentUiEventTaskEndBlocked(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	const result = delegationResult(
		{ id: "task-1", definition: "coder", prompt: "do it" } as DelegationTask,
		"blocked",
		"blocked by missing permission",
	);
	runtime.recordSubagentUiEvent({
		type: "task.end",
		instanceId: "inst-1",
		taskId: "task-1",
		result,
		timestamp: Date.now(),
	});
	const ui = runtime.subagentUi.get("task-1");
	assert.equal(ui?.status, "blocked");
	assert.equal(runtime.getSubagentHealth("task-1")[0]?.status, "blocked");
}

function testRuntimeRecordSubagentUiEventError(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "error",
		instanceId: "inst-1",
		taskId: "task-1",
		error: "Something failed",
		fatal: true,
		timestamp: Date.now(),
	});
	const ui = runtime.subagentUi.get("task-1");
	assert.equal(ui?.status, "failed");
	assert.equal(ui?.summary, "Something failed");
}

function testRuntimeRecordSubagentUiEventInstanceState(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "instance.state",
		instanceId: "inst-1",
		taskId: "task-1",
		state: {
			instanceId: "inst-1",
			taskId: "task-1",
			definitionName: "coder",
			cwd: TEST_CWD,
			state: "running",
			startTime: 1,
			endTime: null,
			turnCount: 5,
			lastActivityAt: Date.now(),
			currentTool: "bash",
			error: null,
			toolCount: 2,
			currentToolStartedAt: null,
			durationMs: 100,
		},
		timestamp: Date.now(),
	});
	const ui = runtime.subagentUi.get("task-1");
	assert.equal(ui?.status, "running");
	assert.equal(ui?.turnCount, 5);
	assert.equal(ui?.currentTool, "bash");
}

function testRuntimeRecordSubagentUiEventInstanceStateStarting(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "instance.state",
		instanceId: "inst-1",
		taskId: "task-1",
		state: {
			instanceId: "inst-1",
			taskId: "task-1",
			definitionName: "coder",
			cwd: TEST_CWD,
			state: "starting",
			startTime: 1,
			endTime: null,
			turnCount: 0,
			lastActivityAt: Date.now(),
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 100,
		},
		timestamp: Date.now(),
	});
	assert.equal(runtime.subagentUi.get("task-1")?.status, "starting");
	assert.equal(runtime.getSubagentHealth("task-1")[0]?.status, "starting");
}

function testRuntimeRecordSubagentUiEventIgnoresNoTaskId(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	runtime.recordSubagentUiEvent({
		type: "lifecycle.change",
		instanceId: "inst-1",
		previous: "created",
		current: "running",
		timestamp: Date.now(),
	} as any);
	// Should not throw
	assert.equal(runtime.subagentUi.get("task-1")?.status, "queued");
}

function testRuntimeFinishJob(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	const result = delegationResult(
		{ id: "task-1", definition: "coder", prompt: "do it" } as DelegationTask,
		"completed",
		"done",
	);
	const job = runtime.finishJob("task-1", result);
	assert.equal(job?.status, "completed");
	assert.equal(job?.result, result);
}

function testRuntimeFinishJobBlocked(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	const result = delegationResult(
		{ id: "task-1", definition: "coder", prompt: "do it" } as DelegationTask,
		"blocked",
		"blocked by missing permission",
	);
	const job = runtime.finishJob("task-1", result);
	assert.equal(job?.status, "blocked");
	assert.equal(job?.result, result);
}

function testRuntimeFinishJobWithError(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	const job = runtime.finishJob("task-1", null, "failed");
	assert.equal(job?.status, "failed");
	assert.equal(job?.error, "failed");
}

function testRuntimeFinishJobUnknownTask(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const job = runtime.finishJob("unknown", null);
	assert.equal(job, null);
}

function testRuntimeStartJob(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const job = runtime.startJob({ runId: "run-1", taskId: "task-1", role: "executor", title: "Build auth" });
	assert.equal(job.status, "queued");
	assert.equal(job.title, "Build auth");
	assert.equal(job.role, "executor");
}

function testRuntimeMarksStalledJobs(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	runtime.startJob({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Build auth",
		timestamp: 1,
	});
	const [job] = runtime.getSubagentHealth("task-1");
	assert.equal(job?.status, "stalled");
}

function testRuntimeRememberUiContext(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const ctx = fakeCtx({ hasUI: true }) as any;
	runtime.rememberUiContext(ctx);
	assert.equal(runtime.lastUiContext, ctx);
}

function testRuntimeRememberUiContextNoUI(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const ctx = fakeCtx({ hasUI: false }) as any;
	runtime.rememberUiContext(ctx);
	assert.equal(runtime.lastUiContext, null);
}

function testMainSessionBridgeAttachCreatesMainThread(): void {
	const bridge = new MainSessionBridge();
	const ctx = fakeCtx({}) as any;
	bridge.attach(ctx);
	const thread = bridge.getThread();
	assert.ok(thread);
	assert.equal(thread.instanceId, "main:test-session");
	assert.equal(thread.kind, "main");
	assert.equal(thread.taskId, "main");
	assert.deepEqual(bridge.getMessages("main:test-session"), []);
}

function testMainSessionBridgeEmitsSessionEvents(): void {
	const bridge = new MainSessionBridge();
	const ctx = fakeCtx({}) as any;
	const events: any[] = [];
	bridge.subscribe((event) => events.push(event));
	bridge.record(
		{
			type: "message_end",
			message: {
				role: "user",
				content: "done",
				timestamp: 1,
			},
		},
		ctx,
	);
	assert.ok(events.some((event) => event.type === "session.event" && event.instanceId === "main:test-session"));
}

function testRuntimeCleanupSubagentUi(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const now = Date.now();
	runtime.startSubagentUi({
		runId: "run-1",
		taskId: "task-1",
		role: "executor",
		title: "Old",
		timestamp: now - 20000,
	});
	runtime.subagentUi.get("task-1")!.status = "completed";
	runtime.subagentUi.get("task-1")!.completedAt = now - 20000;

	runtime.cleanupSubagentUi(now, 5000);
	assert.equal(runtime.subagentUi.has("task-1"), false);
}

function testRuntimeCleanupSubagentUiKeepsRecent(): void {
	const runtime = new LionRuntime(fakePi() as any, TEST_CWD);
	const now = Date.now();
	runtime.startSubagentUi({ runId: "run-1", taskId: "task-1", role: "executor", title: "Recent" });
	runtime.subagentUi.get("task-1")!.status = "completed";
	runtime.subagentUi.get("task-1")!.completedAt = now - 1000;

	runtime.cleanupSubagentUi(now, 5000);
	assert.equal(runtime.subagentUi.has("task-1"), true);
}

// Helpers

const TEST_CWD = "/tmp";

function fakePi() {
	return {
		entries: [] as any[],
		messages: [] as any[],
		appendEntry(type: string, data: any) {
			this.entries.push({ type, data });
		},
		sendMessage(content: any, options: any) {
			this.messages.push({ content, options });
		},
	};
}

function fakePiWithCommands() {
	return {
		...fakePi(),
		commands: new Map<string, any>(),
		registerCommand(name: string, command: any) {
			this.commands.set(name, command);
		},
	};
}

function fakePiWithTools() {
	return {
		...fakePi(),
		tools: new Map<string, any>(),
		registerTool(tool: any) {
			this.tools.set(tool.name, tool);
		},
	};
}

function fakeCtx(opts: {
	entries?: any[];
	cwd?: string;
	sessionId?: string;
	isIdle?: boolean;
	hasPending?: boolean;
	hasUI?: boolean;
	statusUpdates?: Array<{ key: string; value: string | undefined }>;
}) {
	return {
		sessionManager: {
			getBranch: () => opts.entries || [],
			getEntries: () => opts.entries || [],
			getLeafId: () => undefined,
			getCwd: () => opts.cwd ?? "/tmp",
			getSessionId: () => opts.sessionId ?? "test-session",
			getSessionFile: () => undefined,
			getSessionName: () => undefined,
		},
		cwd: opts.cwd,
		isIdle: () => opts.isIdle ?? true,
		hasPendingMessages: () => opts.hasPending ?? false,
		hasUI: opts.hasUI ?? false,
		ui: {
			setStatus: (key: string, value: string | undefined) => {
				opts.statusUpdates?.push({ key, value });
			},
			showMessage: () => {},
			theme: {
				fg: (_name: string, text: string) => text,
			},
		},
		modelRegistry: {
			getApiKeyAndHeaders: () => Promise.resolve({ ok: true, apiKey: "test", headers: {} }),
		},
		waitForIdle: () => Promise.resolve(),
	};
}

function readToolCall(path: string): ToolCallEvent {
	return {
		type: "tool_call",
		toolName: "read",
		toolCallId: `read-${path}`,
		input: { path },
	};
}

function lsToolCall(path: string): ToolCallEvent {
	return {
		type: "tool_call",
		toolName: "ls",
		toolCallId: `ls-${path}`,
		input: { path },
	};
}

function lionTasksToolCall(toolCallId: string): ToolCallEvent {
	return {
		type: "tool_call",
		toolName: "lion_tasks",
		toolCallId,
		input: {},
	};
}

function lionTasksToolResult(toolCallId: string): ToolResultEvent {
	return {
		type: "tool_result",
		toolName: "lion_tasks",
		toolCallId,
		input: {},
		content: [],
		details: undefined,
		isError: false,
	};
}

function createStructuredPlanDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "lion-structured-"));
	writeFileSync(
		join(dir, "task-index.md"),
		`# Test Plan

## T-001: Task 1

Status: pending

## T-002: Task 2

Status: pending
`,
	);
	writeFileSync(join(dir, "context.md"), "# Context\n\nTest project context.");
	writeFileSync(join(dir, "requirements.md"), "# Requirements\n\n- req-1\n- req-2");
	mkdirSync(join(dir, "tasks"), { recursive: true });
	writeFileSync(
		join(dir, "tasks", "T-001.md"),
		`# T-001: Task 1

Status: pending
Dependencies:
Requirements:
`,
	);
	writeFileSync(
		join(dir, "tasks", "T-002.md"),
		`# T-002: Task 2

Status: pending
Dependencies:
Requirements:
`,
	);
	return dir;
}

function createStructuredPlanDirWithChecklist(options?: { title?: string }): string {
	const dir = mkdtempSync(join(tmpdir(), "lion-structured-"));
	const title = options?.title ?? "Task 1";
	writeFileSync(
		join(dir, "task-index.md"),
		`# Test Plan

## T-001: ${title}

Status: pending
`,
	);
	writeFileSync(join(dir, "context.md"), "# Context\n\nTest project context.");
	writeFileSync(join(dir, "requirements.md"), "# Requirements\n\n- req-1");
	writeFileSync(
		join(dir, "checklist.json"),
		JSON.stringify({
			completed: 0,
			total_tasks: 1,
			tasks: [{ id: "T-001", title, status: "pending", dependencies: [], requirements: [] }],
		}),
	);
	return dir;
}

function createStructuredPlanDirWithDependentChecklist(): string {
	const dir = mkdtempSync(join(tmpdir(), "lion-structured-"));
	writeFileSync(
		join(dir, "task-index.md"),
		`# Test Plan

## T-001: Task 1

Status: pending

## T-002: Task 2

Status: pending
`,
	);
	writeFileSync(join(dir, "context.md"), "# Context\n\nTest project context.");
	writeFileSync(join(dir, "requirements.md"), "# Requirements\n\n- req-1");
	writeFileSync(
		join(dir, "checklist.json"),
		JSON.stringify({
			completed: 0,
			total_tasks: 2,
			tasks: [
				{ id: "T-001", title: "Task 1", status: "pending", dependencies: [], requirements: [] },
				{ id: "T-002", title: "Task 2", status: "pending", dependencies: ["T-001"], requirements: [] },
			],
		}),
	);
	return dir;
}

// Run all tests

const tests = [
	{ name: "testStartRunInitializesRun", fn: testStartRunInitializesRun },
	{ name: "testFinishRunMarksComplete", fn: testFinishRunMarksComplete },
	{ name: "testFinishRunRetriesOnReject", fn: testFinishRunRetriesOnReject },
	{ name: "testFinishRunFailsAfterMaxAttempts", fn: testFinishRunFailsAfterMaxAttempts },
	{ name: "testRecordSubagentResultUpdatesRun", fn: testRecordSubagentResultUpdatesRun },
	{ name: "testParseReviewVerdict", fn: testParseReviewVerdict },
	{ name: "testBuildPlanReviewPrompt", fn: testBuildPlanReviewPrompt },
	{ name: "testBuildPlanningSystemPrompt", fn: testBuildPlanningSystemPrompt },
	{ name: "testHasPlanReferenceSupportsStructuredBriefs", fn: testHasPlanReferenceSupportsStructuredBriefs },
	{ name: "testReviewPlanExtractsMarkdownScopePaths", fn: testReviewPlanExtractsMarkdownScopePaths },
	{ name: "testBuildSimpleSystemPrompt", fn: testBuildSimpleSystemPrompt },
	{ name: "testTaskRunnerAddsPlanContextToDelegations", fn: testTaskRunnerAddsPlanContextToDelegations },
	{
		name: "testTaskRunnerAddsPlanContextWhenBriefHasGenericLionContext",
		fn: testTaskRunnerAddsPlanContextWhenBriefHasGenericLionContext,
	},
	{ name: "testTaskRunnerAddsSimpleContextToDelegations", fn: testTaskRunnerAddsSimpleContextToDelegations },
	{ name: "testTaskRunnerRejectsExecutorInPlanningPhase", fn: testTaskRunnerRejectsExecutorInPlanningPhase },
	{
		name: "testTaskRunnerForcesAnalyzerReadOnlyInPlanningPhase",
		fn: testTaskRunnerForcesAnalyzerReadOnlyInPlanningPhase,
	},
	{
		name: "testTaskRunnerAllowsValidatorInPlanningPhase",
		fn: testTaskRunnerAllowsValidatorInPlanningPhase,
	},
	{
		name: "testTaskRunnerAllowsReviewerInPlanningPhase",
		fn: testTaskRunnerAllowsReviewerInPlanningPhase,
	},
	{
		name: "testTaskRunnerRejectsReviewerInReviewPlanningPhase",
		fn: testTaskRunnerRejectsReviewerInReviewPlanningPhase,
	},
	{
		name: "testTaskRunnerRunsActivePlanNextTaskInBuildPhase",
		fn: testTaskRunnerRunsActivePlanNextTaskInBuildPhase,
	},
	{
		name: "testTaskRunnerBlocksActivePlanTaskWithoutStructuredResult",
		fn: testTaskRunnerBlocksActivePlanTaskWithoutStructuredResult,
	},
	{
		name: "testTaskRunnerRejectsNonExecutorActivePlanSource",
		fn: testTaskRunnerRejectsNonExecutorActivePlanSource,
	},
	{
		name: "testTaskRunnerEscapesActivePlanTaskPrompt",
		fn: testTaskRunnerEscapesActivePlanTaskPrompt,
	},
	{
		name: "testTaskRunnerReturnsUpdatedPlanOnActivePlanFailure",
		fn: testTaskRunnerReturnsUpdatedPlanOnActivePlanFailure,
	},
	{
		name: "testTaskRunnerMarksDelegationLimitAsRetryable",
		fn: testTaskRunnerMarksDelegationLimitAsRetryable,
	},
	{
		name: "testLionBuildCommandRunsActivePlanToCompletion",
		fn: testLionBuildCommandRunsActivePlanToCompletion,
	},
	{
		name: "testLionBuildCommandStopsOnRetryableTask",
		fn: testLionBuildCommandStopsOnRetryableTask,
	},
	{ name: "testStructuredPlanNextTaskRespectsDependencies", fn: testStructuredPlanNextTaskRespectsDependencies },
	{ name: "testStructuredPlanRecordTaskResultPersistsSummary", fn: testStructuredPlanRecordTaskResultPersistsSummary },
	{ name: "testLionTaskEvidenceRequiresValidation", fn: testLionTaskEvidenceRequiresValidation },
	{ name: "testLionTaskEvidenceDetectsHiddenErrors", fn: testLionTaskEvidenceDetectsHiddenErrors },
	{ name: "testLionTaskEvidenceUsesRecordedResult", fn: testLionTaskEvidenceUsesRecordedResult },
	{ name: "testLionActivatePlanToolKeepsPlanningPhase", fn: testLionActivatePlanToolKeepsPlanningPhase },
	{ name: "testLionValidateCommandInjectsLionTasksPrompt", fn: testLionValidateCommandInjectsLionTasksPrompt },
	{ name: "testLionReviewCommandCreatesPlanReviewPipeline", fn: testLionReviewCommandCreatesPlanReviewPipeline },
	{ name: "testLionReviewCommandRequiresActivePlan", fn: testLionReviewCommandRequiresActivePlan },
	{
		name: "testLionToolsRegisterPlanActivationAndDelegationOnly",
		fn: testLionToolsRegisterPlanActivationAndDelegationOnly,
	},
	{ name: "testLionDashboardUrlUsesStatusOnly", fn: testLionDashboardUrlUsesStatusOnly },
	{ name: "testLionExtensionDoesNotGuardWhenInactive", fn: testLionExtensionDoesNotGuardWhenInactive },
	{ name: "testDelegationGuardTurnCompatibilityMethods", fn: testDelegationGuardTurnCompatibilityMethods },
	{ name: "testDelegationGuardAllowsStructureProbes", fn: testDelegationGuardAllowsStructureProbes },
	{
		name: "testDelegationGuardAllowsReads",
		fn: testDelegationGuardAllowsReads,
	},
	{ name: "testDelegationGuardAllowsUnlimitedStructureProbes", fn: testDelegationGuardAllowsUnlimitedStructureProbes },
	{ name: "testDelegationGuardAllowsAfterLionTasks", fn: testDelegationGuardAllowsAfterLionTasks },
	{ name: "testDelegationGuardReleasesLionTasksOnToolResult", fn: testDelegationGuardReleasesLionTasksOnToolResult },
	{
		name: "testDelegationGuardAllowsSequentialTopLevelLionTasks",
		fn: testDelegationGuardAllowsSequentialTopLevelLionTasks,
	},
	{ name: "testDelegationGuardBlocksActualNestedLionTasks", fn: testDelegationGuardBlocksActualNestedLionTasks },
	{ name: "testDelegationGuardAllowsDirectEdits", fn: testDelegationGuardAllowsDirectEdits },
	{ name: "testDelegationGuardAllowsPlanReads", fn: testDelegationGuardAllowsPlanReads },
	{ name: "testDelegationGuardAllowsPlanEdits", fn: testDelegationGuardAllowsPlanEdits },
	{ name: "testDelegationGuardAllowsPlanMultiEdits", fn: testDelegationGuardAllowsPlanMultiEdits },
	{ name: "testDelegationGuardBlocksPlanChecklistReads", fn: testDelegationGuardBlocksPlanChecklistReads },
	{ name: "testDelegationGuardBlocksReviewChecklistEdits", fn: testDelegationGuardBlocksReviewChecklistEdits },
	{ name: "testDelegationGuardBlocksChecklistMultiEdits", fn: testDelegationGuardBlocksChecklistMultiEdits },
	{ name: "testWidgetLinesWithNoJobs", fn: testWidgetLinesWithNoJobs },
	{ name: "testWidgetLinesWithJobs", fn: testWidgetLinesWithJobs },
	{ name: "testWidgetLinesWithCompletedJob", fn: testWidgetLinesWithCompletedJob },
	{ name: "testWidgetLinesWithFailedJob", fn: testWidgetLinesWithFailedJob },
	{ name: "testWidgetLinesHidesProgressDetails", fn: testWidgetLinesHidesProgressDetails },
	{ name: "testWidgetLinesFitInPanel", fn: testWidgetLinesFitInPanel },
	{ name: "testWidgetCleanupRemovesOldCompleted", fn: testWidgetCleanupRemovesOldCompleted },
	{ name: "testWidgetCleanupKeepsRecentCompleted", fn: testWidgetCleanupKeepsRecentCompleted },
	{ name: "testWidgetCleanupKeepsRunning", fn: testWidgetCleanupKeepsRunning },
	{ name: "testWidgetCleanupRemovesOrphanedQueued", fn: testWidgetCleanupRemovesOrphanedQueued },
	{ name: "testWidgetCleanupKeepsRecentQueued", fn: testWidgetCleanupKeepsRecentQueued },
	{ name: "testChecklistFileRoundTrip", fn: testChecklistFileRoundTrip },
	{ name: "testChecklistFileUpdateNonExistentTask", fn: testChecklistFileUpdateNonExistentTask },
	{ name: "testChecklistFileLoadTasks", fn: testChecklistFileLoadTasks },
	{ name: "testChecklistFileLoadTasksWithRequirements", fn: testChecklistFileLoadTasksWithRequirements },
	{ name: "testChecklistFileRunningMapsToInProgress", fn: testChecklistFileRunningMapsToInProgress },
	{ name: "testStructuredPlanFileRoundTrip", fn: testStructuredPlanFileRoundTrip },
	{ name: "testStructuredPlanFileLoadMissing", fn: testStructuredPlanFileLoadMissing },
	{ name: "testStructuredPlanFileMarkTaskComplete", fn: testStructuredPlanFileMarkTaskComplete },
	{ name: "testStructuredPlanFileMarkNonExistentTask", fn: testStructuredPlanFileMarkNonExistentTask },
	{ name: "testResolvePlanPath", fn: testResolvePlanPath },
	{ name: "testResolvePlanPathWithDir", fn: testResolvePlanPathWithDir },
	{ name: "testRuntimeRestoreState", fn: testRuntimeRestoreState },
	{ name: "testRuntimeRestoreStateIgnoresOtherSession", fn: testRuntimeRestoreStateIgnoresOtherSession },
	{
		name: "testRuntimeRestoreStateIgnoresOwnerlessActiveDocument",
		fn: testRuntimeRestoreStateIgnoresOwnerlessActiveDocument,
	},
	{ name: "testRuntimeRestoreStateIgnoresLegacyVersion", fn: testRuntimeRestoreStateIgnoresLegacyVersion },
	{ name: "testRuntimeRestoreStateInvalidVersion", fn: testRuntimeRestoreStateInvalidVersion },
	{ name: "testRuntimeRestoreStateNoEntries", fn: testRuntimeRestoreStateNoEntries },
	{ name: "testRuntimePersist", fn: testRuntimePersist },
	{ name: "testRuntimeEmit", fn: testRuntimeEmit },
	{ name: "testRuntimeRetainAndRelease", fn: testRuntimeRetainAndRelease },
	{ name: "testRuntimeRetainMultipleSameRun", fn: testRuntimeRetainMultipleSameRun },
	{ name: "testRuntimeCreateSubAgentController", fn: testRuntimeCreateSubAgentController },
	{ name: "testRuntimeEnsureControllerReturnsSame", fn: testRuntimeEnsureControllerReturnsSame },
	{ name: "testRuntimeSetMode", fn: testRuntimeSetMode },
	{ name: "testRuntimeActivateSimple", fn: testRuntimeActivateSimple },
	{ name: "testRuntimeActivatePlanningClearsPreviousPlan", fn: testRuntimeActivatePlanningClearsPreviousPlan },
	{
		name: "testLionActivateCommandWithoutReferenceStartsFreshPlanning",
		fn: testLionActivateCommandWithoutReferenceStartsFreshPlanning,
	},
	{ name: "testLionSimpleCommandActivatesSimpleStrategy", fn: testLionSimpleCommandActivatesSimpleStrategy },
	{ name: "testRuntimeCompactionInstructionsUseStrategy", fn: testRuntimeCompactionInstructionsUseStrategy },
	{ name: "testRuntimeSetActiveTask", fn: testRuntimeSetActiveTask },
	{ name: "testRuntimeSetLastRun", fn: testRuntimeSetLastRun },
	{ name: "testRuntimeApplyBuildResult", fn: testRuntimeApplyBuildResult },
	{ name: "testRuntimeQueueFeedbackWhenIdle", fn: testRuntimeQueueFeedbackWhenIdle },
	{ name: "testRuntimeQueueFeedbackWhenBusy", fn: testRuntimeQueueFeedbackWhenBusy },
	{ name: "testRuntimeQueueFeedbackSkipsWhenPending", fn: testRuntimeQueueFeedbackSkipsWhenPending },
	{ name: "testRuntimeGetSubagentHealth", fn: testRuntimeGetSubagentHealth },
	{ name: "testRuntimeGetSubagentHealthByTaskId", fn: testRuntimeGetSubagentHealthByTaskId },
	{ name: "testRuntimeRecordSubagentUiEvent", fn: testRuntimeRecordSubagentUiEvent },
	{ name: "testRuntimeRecordSubagentUiEventTurnComplete", fn: testRuntimeRecordSubagentUiEventTurnComplete },
	{ name: "testRuntimeRecordSubagentUiEventToolStart", fn: testRuntimeRecordSubagentUiEventToolStart },
	{ name: "testRuntimeRecordSubagentUiEventToolEnd", fn: testRuntimeRecordSubagentUiEventToolEnd },
	{ name: "testRuntimeRecordSubagentUiEventProgress", fn: testRuntimeRecordSubagentUiEventProgress },
	{ name: "testRuntimeRecordSubagentUiEventTaskEnd", fn: testRuntimeRecordSubagentUiEventTaskEnd },
	{ name: "testRuntimeRecordSubagentUiEventTaskEndBlocked", fn: testRuntimeRecordSubagentUiEventTaskEndBlocked },
	{ name: "testRuntimeRecordSubagentUiEventError", fn: testRuntimeRecordSubagentUiEventError },
	{ name: "testRuntimeRecordSubagentUiEventInstanceState", fn: testRuntimeRecordSubagentUiEventInstanceState },
	{
		name: "testRuntimeRecordSubagentUiEventInstanceStateStarting",
		fn: testRuntimeRecordSubagentUiEventInstanceStateStarting,
	},
	{ name: "testRuntimeRecordSubagentUiEventIgnoresNoTaskId", fn: testRuntimeRecordSubagentUiEventIgnoresNoTaskId },
	{ name: "testRuntimeFinishJob", fn: testRuntimeFinishJob },
	{ name: "testRuntimeFinishJobBlocked", fn: testRuntimeFinishJobBlocked },
	{ name: "testRuntimeFinishJobWithError", fn: testRuntimeFinishJobWithError },
	{ name: "testRuntimeFinishJobUnknownTask", fn: testRuntimeFinishJobUnknownTask },
	{ name: "testRuntimeStartJob", fn: testRuntimeStartJob },
	{ name: "testRuntimeMarksStalledJobs", fn: testRuntimeMarksStalledJobs },
	{ name: "testRuntimeRememberUiContext", fn: testRuntimeRememberUiContext },
	{ name: "testRuntimeRememberUiContextNoUI", fn: testRuntimeRememberUiContextNoUI },
	{ name: "testMainSessionBridgeAttachCreatesMainThread", fn: testMainSessionBridgeAttachCreatesMainThread },
	{ name: "testMainSessionBridgeEmitsSessionEvents", fn: testMainSessionBridgeEmitsSessionEvents },
	{ name: "testRuntimeCleanupSubagentUi", fn: testRuntimeCleanupSubagentUi },
	{ name: "testRuntimeCleanupSubagentUiKeepsRecent", fn: testRuntimeCleanupSubagentUiKeepsRecent },
];

async function runTests() {
	let passed = 0;
	let failed = 0;
	for (const { name, fn } of tests) {
		try {
			await fn();
			passed++;
		} catch (err) {
			failed++;
			console.error(`FAIL: ${name}`);
			console.error(err);
		}
	}
	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

runTests();
