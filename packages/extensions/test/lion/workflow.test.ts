import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { DelegationResult, DelegationTask, SubAgentController } from "@local/pi-subagents";
import {
	finishRun,
	type LionCore,
	recordReviewVerdict,
	recordSubagentResult,
	startRun,
} from "../../src/extensions/lion/core.js";
import { LionEvents } from "../../src/extensions/lion/events/defs.js";
import { createLionRunReporter, LionEventBus } from "../../src/extensions/lion/events/index.js";
import { LionChecklistFile } from "../../src/extensions/lion/plans/checklist.js";
import { StructuredLionPlanFile } from "../../src/extensions/lion/plans/structured.js";
import { buildPlanReviewPrompt } from "../../src/extensions/lion/prompts/plan-reviewer.js";
import { buildPlanningSystemPrompt } from "../../src/extensions/lion/prompts/planning.js";
import { LionRuntime } from "../../src/extensions/lion/runtime.js";

import type { LionPlan, LionTask } from "../../src/extensions/lion/types.js";
import { buildLionSubagentWidgetLines } from "../../src/extensions/lion/ui/subagents-widget.js";
import { parseReviewVerdict } from "../../src/extensions/lion/utils.js";

const plan: LionPlan = {
	kind: "structured",
	slug: "test-plan",
	rootPath: "/tmp/test-plan",
	indexFile: "/tmp/test-plan/task-index.md",
	tasks: [],
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
		duration: 1,
		turnCount: 1,
		finalState: {
			instanceId: `instance-${task.id}`,
			taskId: task.id,
			definitionName: task.definition,
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

async function testReporterPersistsAndForwardsEvents(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "lion-events-"));
	try {
		const bus = new LionEventBus();
		const forwarded: any[] = [];
		bus.subscribe((event) => forwarded.push(event));
		createLionRunReporter({ cwd } as any, bus, { getActivePlanSlug: () => "test-plan" });

		bus.publish(LionEvents.taskApproved, {
			runId: "run-1",
			planSlug: "test-plan",
			planPath: "/tmp/x",
			taskId: "T-001",
		});
		bus.publish(LionEvents.taskMarkedComplete, {
			runId: "run-1",
			planSlug: "test-plan",
			planPath: "/tmp/x",
			taskId: "T-001",
		});

		assert.deepEqual(
			forwarded.map((event) => event.type),
			["lion.task.approved", "lion.task.marked_complete"],
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		const lines = readFileSync(join(cwd, ".lion", "runs", "run-1.events.jsonl"), "utf-8")
			.trim()
			.split("\n");
		assert.equal(lines.length, 2);
		const types = lines.map((l) => JSON.parse(l).type);
		assert.ok(types.includes("lion.task.approved"));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testReporterFlagsCompleteWithoutApproval(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "lion-events-"));
	try {
		const bus = new LionEventBus();
		const forwarded: any[] = [];
		bus.subscribe((event) => forwarded.push(event));
		createLionRunReporter({ cwd } as any, bus, { getActivePlanSlug: () => "test-plan" });

		bus.publish(LionEvents.taskMarkedComplete, {
			runId: "run-1",
			planSlug: "test-plan",
			planPath: "/tmp/x",
			taskId: "T-001",
		});

		assert.deepEqual(
			forwarded.map((event) => event.type),
			["lion.task.marked_complete", "lion.rule.violation"],
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		const lines = readFileSync(join(cwd, ".lion", "runs", "run-1.events.jsonl"), "utf-8")
			.trim()
			.split("\n");
		assert.equal(lines.length, 2);
		assert.equal(JSON.parse(lines[1]).type, "lion.rule.violation");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testReporterSkipsSubagentNoiseInPlanLog(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "lion-events-"));
	try {
		const bus = new LionEventBus();
		const forwarded: any[] = [];
		bus.subscribe((event) => forwarded.push(event));
		createLionRunReporter({ cwd } as any, bus, { getActivePlanSlug: () => "test-plan" });

		bus.publish(LionEvents.subagentEvent, {
			runId: "run-1",
			planSlug: "test-plan",
			planPath: "/tmp/x",
			taskId: "T-001",
			subagentEvent: {
				type: "progress.update",
				instanceId: "instance-1",
				taskId: "T-001-executor-1",
				message: "working",
				timestamp: 1,
			},
		} as any);
		bus.publish(LionEvents.taskApproved, {
			runId: "run-1",
			planSlug: "test-plan",
			planPath: "/tmp/x",
			taskId: "T-001",
		});

		assert.deepEqual(
			forwarded.map((event) => event.type),
			["lion.subagent.event", "lion.task.approved"],
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		const lines = readFileSync(join(cwd, ".lion", "runs", "run-1.events.jsonl"), "utf-8")
			.trim()
			.split("\n");
		assert.equal(lines.length, 2);
		const types = lines.map((l) => JSON.parse(l).type);
		assert.ok(types.includes("lion.task.approved"));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

interface TestChecklistRecord {
	completed?: number;
	total_tasks?: number;
	tasks: Array<{ id: string; status?: string; title?: string; name?: string }>;
}

function writeJson(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function readChecklistRecord(path: string): TestChecklistRecord {
	return JSON.parse(readFileSync(path, "utf-8")) as TestChecklistRecord;
}

function createTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function testChecklistLoadsTasksDeclaratively(): void {
	const cwd = createTempDir("lion-checklist-");
	try {
		const checklistFile = join(cwd, "checklist.json");
		writeJson(checklistFile, {
			tasks: [
				{
					id: "T-001",
					title: "Titled task",
					file: "tasks/one.md",
					status: "running",
					dependencies: ["T-000", 1],
					requirements: ["FR-001", false],
					phase: "foundation",
				},
				{ id: "T-002", name: "Named task", status: "not-real" },
			],
		});

		const tasks = new LionChecklistFile(checklistFile).loadTasks();

		assert.equal(tasks[0].title, "Titled task");
		assert.equal(tasks[0].status, "in_progress");
		assert.deepEqual(tasks[0].dependencies, ["T-000"]);
		assert.deepEqual(tasks[0].requirements, ["FR-001"]);
		assert.equal(tasks[0].phase, "foundation");
		assert.equal(tasks[1].title, "Named task");
		assert.equal(tasks[1].status, "pending");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testChecklistUpdatesStatusAndCounters(): void {
	const cwd = createTempDir("lion-checklist-");
	try {
		const checklistFile = join(cwd, "checklist.json");
		writeJson(checklistFile, {
			completed: 0,
			total_tasks: 0,
			tasks: [
				{ id: "T-001", title: "One", status: "pending" },
				{ id: "T-002", title: "Two", status: "complete" },
			],
		});

		new LionChecklistFile(checklistFile).updateTaskStatus("T-001", "complete");
		const record = readChecklistRecord(checklistFile);

		assert.equal(record.completed, 2);
		assert.equal(record.total_tasks, 2);
		assert.equal(record.tasks[0].status, "complete");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testChecklistRejectsInvalidTasksShape(): void {
	const cwd = createTempDir("lion-checklist-");
	try {
		const checklistFile = join(cwd, "checklist.json");
		writeJson(checklistFile, { tasks: "invalid" });

		assert.throws(
			() => new LionChecklistFile(checklistFile).loadTasks(),
			/Invalid checklist: tasks must be an array/,
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testChecklistRejectsMissingTask(): void {
	const cwd = createTempDir("lion-checklist-");
	try {
		const checklistFile = join(cwd, "checklist.json");
		writeJson(checklistFile, { tasks: [{ id: "T-001", title: "One" }] });

		assert.throws(
			() => new LionChecklistFile(checklistFile).updateTaskStatus("T-999", "complete"),
			/Task T-999 not found in checklist/,
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function createStructuredPlanDir(): string {
	const cwd = createTempDir("lion-structured-");
	mkdirSync(join(cwd, "tasks"), { recursive: true });
	writeFileSync(join(cwd, "context.md"), "Context text", "utf-8");
	writeFileSync(join(cwd, "requirements.md"), "Requirements text", "utf-8");
	writeFileSync(join(cwd, "task-index.md"), "Task index text", "utf-8");
	writeFileSync(join(cwd, "tasks", "one.md"), "Task brief text", "utf-8");
	writeJson(join(cwd, "checklist.json"), {
		completed: 0,
		total_tasks: 1,
		tasks: [{ id: "T-001", title: "One", file: "tasks/one.md", status: "pending" }],
	});
	return cwd;
}

function testStructuredPlanLoadsRequiredFiles(): void {
	const cwd = createStructuredPlanDir();
	try {
		const loadedPlan = new StructuredLionPlanFile(cwd).loadPlan();

		assert.equal(loadedPlan.kind, "structured");
		assert.equal(loadedPlan.rootPath, resolve(cwd));
		assert.equal(loadedPlan.contextFile, join(resolve(cwd), "context.md"));
		assert.equal(loadedPlan.tasks[0].id, "T-001");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testStructuredPlanReadsContent(): void {
	const cwd = createStructuredPlanDir();
	try {
		const planFile = new StructuredLionPlanFile(cwd);
		const loadedPlan = planFile.loadPlan();
		const loadedContent = planFile.readContent(loadedPlan, loadedPlan.tasks[0]);

		assert.deepEqual(loadedContent, {
			context: "Context text",
			requirements: "Requirements text",
			taskIndex: "Task index text",
			taskBrief: "Task brief text",
		});
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testStructuredPlanRejectsMissingRequiredFile(): void {
	const cwd = createStructuredPlanDir();
	try {
		rmSync(join(cwd, "requirements.md"));

		assert.throws(() => new StructuredLionPlanFile(cwd).loadPlan(), /Required plan file missing: .*requirements\.md/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testStructuredPlanDelegatesChecklistUpdates(): void {
	const cwd = createStructuredPlanDir();
	try {
		const planFile = new StructuredLionPlanFile(cwd);
		const loadedPlan = planFile.loadPlan();

		planFile.markTaskComplete(loadedPlan, "T-001");
		const record = readChecklistRecord(join(cwd, "checklist.json"));

		assert.equal(record.completed, 1);
		assert.equal(record.total_tasks, 1);
		assert.equal(record.tasks[0].status, "complete");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testCoreRecordsRunAndFinishes(): void {
	const core: LionCore = { activeRun: null, runHistory: [] };
	const run = startRun(core, { runId: "run-1", plan, task, maxAttempts: 3 });
	assert.equal(run.status, "executing");

	const executor = delegationResult(
		{ id: "T-001-executor-1", definition: "executor", prompt: "do it" },
		"completed",
		"done",
	);
	recordSubagentResult(core, "executor", executor);

	assert.equal(core.activeRun?.status, "awaiting_orchestrator");
	assert.equal(core.activeRun?.executorTaskId, "T-001-executor-1");
	assert.equal(core.activeRun?.attempts, 1);

	recordReviewVerdict(core, "approved", "ok\n<LION-APPROVE>");
	assert.equal(core.activeRun?.status, "approved");
	const result = finishRun(core, "approved");

	assert.equal(result.status, "approved");
	assert.equal(core.activeRun, null);
	assert.equal(core.runHistory.length, 1);
}

function fakePi(overrides: Record<string, unknown> = {}) {
	return { appendEntry: () => {}, ...overrides };
}

function testFinishRunMarksComplete(): void {
	const cwd = createStructuredPlanDir();
	try {
		const runtime = new LionRuntime(fakePi() as any);
		const loadedPlan = new StructuredLionPlanFile(cwd).loadPlan();
		createLionRunReporter({ cwd } as any, runtime.events, { getActivePlanSlug: () => loadedPlan.slug });
		startRun(runtime.core, { runId: "run-1", plan: loadedPlan, task: loadedPlan.tasks[0], maxAttempts: 3 });
		recordReviewVerdict(runtime.core, "approved", "ok\n<LION-APPROVE>");

		const result = finishRun(runtime.core, "approved");
		const record = readChecklistRecord(join(cwd, "checklist.json"));

		assert.equal(result.status, "approved");
		assert.equal(record.tasks[0].status, "pending"); // finishRun no longer mutates checklist directly
		assert.equal(runtime.core.activeRun, null);
		assert.equal(runtime.core.runHistory.length, 1);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testReviewerTagsParse(): void {
	assert.equal(parseReviewVerdict("Looks good\n<LION-APPROVE>"), "approved");
	assert.equal(parseReviewVerdict("Issues remain\n<LION-REJECTED>"), "rejected");
	assert.equal(parseReviewVerdict("legacy\nLION_REVIEW_STATUS: approved"), "approved");
}

function testFeedbackDeliveryModes(): void {
	const sends: Array<{ options: unknown }> = [];
	const runtime = new LionRuntime(
		fakePi({ sendMessage: (_message: unknown, options: unknown) => sends.push({ options }) }) as any,
	);
	runtime.queueFeedback({ isIdle: () => true } as any, "idle", {});
	runtime.queueFeedback({ isIdle: () => false } as any, "busy", {});

	assert.deepEqual(sends[0].options, { triggerTurn: true });
	assert.deepEqual(sends[1].options, { triggerTurn: true, deliverAs: "followUp" });
}

function testPlanReviewPrompt(): void {
	const prompt = buildPlanReviewPrompt(plan);
	assert.ok(prompt.includes(plan.slug));
	assert.ok(prompt.includes(plan.indexFile));
	assert.ok(prompt.includes(plan.tasks[0].file));
}

function _testPlanReviewPromptWithFocus(): void {
	const prompt = buildPlanReviewPrompt(plan, "requirements");
	assert.ok(prompt.includes("requirements"));
}

async function testPlanValidatorDelegationUsesExecutor(): Promise<void> {
	const executed: DelegationTask[] = [];
	const controller = {
		executeTask: async (delegationTask: DelegationTask): Promise<DelegationResult> => {
			executed.push(delegationTask);
			return delegationResult(delegationTask, "completed", "Looks good\n<LION-PLAN-VALID>");
		},
	} as unknown as SubAgentController;
	const bus = new LionEventBus();
	const events: any[] = [];
	bus.subscribe((event) => events.push(event));

	const taskId = `${plan.slug}-validator-run-validate`;
	const delegationTask: DelegationTask = {
		id: taskId,
		definition: "executor",
		description: `Validate and fix Lion plan ${plan.slug}`,
		prompt: buildPlanReviewPrompt(plan),
		systemPromptMode: "append",
		capabilities: { canEdit: true, canWrite: true, canExecute: false, canResearch: true },
	};
	bus.publish(LionEvents.delegationStart, {
		runId: "run-validate",
		planSlug: plan.slug,
		planPath: plan.rootPath,
		taskId,
		attempt: 1,
		agent: "validator",
	});
	const result = await controller.executeTask(delegationTask);
	bus.publish(LionEvents.delegationEnd, {
		runId: "run-validate",
		planSlug: plan.slug,
		planPath: plan.rootPath,
		taskId,
		attempt: 1,
		agent: "validator",
		status: result.status,
		summary: result.summary,
	});

	assert.equal(executed[0].definition, "analyzer");
	assert.deepEqual(executed[0].capabilities, {
		canEdit: false,
		canWrite: false,
		canExecute: false,
		canResearch: true,
	});
	assert.deepEqual(executed[0].disabledTools, ["edit", "write", "multi-edit"]);
	assert.equal(result.status, "completed");
	assert.deepEqual(
		events.map((event) => event.type),
		["lion.delegation.start", "lion.delegation.end"],
	);
	assert.equal(
		events[0].type === "lion.delegation.start"
			? ((events[0] as any).payload?.agent ?? (events[0] as any).agent)
			: undefined,
		"validator",
	);
}

function testPlanningPromptDefinesAgentSizedTasks(): void {
	const prompt = buildPlanningSystemPrompt({
		version: 1,
		active: true,
		mode: "planning",
		activePlanPath: "/tmp/test-plan",
		activePlanSlug: "test-plan",
		planKind: "structured",
		activeTaskId: null,
		maxAttempts: 3,
		lastRunId: null,
	});

	assert.match(prompt, /task delegation with lion_tasks/i);
	assert.match(prompt, /available subagent definitions/i);
	assert.match(prompt, /execution examples/i);
}

function testLionSubagentWidgetRendering(): void {
	const runtime = new LionRuntime(fakePi() as any);
	const now = Date.now();
	runtime.startSubagentUi({
		runId: "run-1",
		taskId: "T-001-executor-1",
		role: "executor",
		title: "Task one",
		timestamp: now - 1000,
	});
	runtime.recordSubagentUiEvent({
		type: "task.start",
		instanceId: "instance-1",
		taskId: "T-001-executor-1",
		definitionName: "executor",
		description: "Task one",
		timestamp: now - 900,
	});
	runtime.recordSubagentUiEvent({
		type: "turn.complete",
		instanceId: "instance-1",
		taskId: "T-001-executor-1",
		turnIndex: 0,
		toolCount: 3,
		hadError: false,
		timestamp: now - 100,
	});

	const lines = buildLionSubagentWidgetLines(runtime.subagentUi.values(), plainTheme as never, 80, now);
	const text = lines.join("\n");
	assert.match(text, /Lion subagents/);
	assert.match(text, /executor T-001-executor-1 .* running/);
	assert.match(text, /1 turn/);
	assert.match(text, /3 tool uses/);
}

function testLionSubagentWidgetCompletedAndCleanup(): void {
	const runtime = new LionRuntime(fakePi() as any);
	const now = Date.now();
	runtime.startSubagentUi({
		runId: "run-1",
		taskId: "T-001-reviewer-1",
		role: "reviewer",
		title: "Review",
		timestamp: now - 2000,
	});
	runtime.recordSubagentUiEvent({
		type: "task.end",
		instanceId: "instance-2",
		taskId: "T-001-reviewer-1",
		result: delegationResult(
			{ id: "T-001-reviewer-1", definition: "reviewer", prompt: "review" },
			"completed",
			"Approved\n<LION-APPROVE>",
		),
		timestamp: now - 1000,
	});

	const lines = buildLionSubagentWidgetLines(runtime.subagentUi.values(), plainTheme as never, 50, now);
	assert.match(lines.join("\n"), /reviewer T-001-reviewer-1 .* completed/);
	assert.ok(lines.every((line) => visibleWidth(line) <= 50));

	runtime.cleanupSubagentUi(now + 11000, 10000);
	assert.equal(runtime.subagentUi.size, 0);
}

function testLionSubagentHealthTracksRecentEvents(): void {
	const runtime = new LionRuntime(fakePi() as any);
	runtime.startJob({
		runId: "run-1",
		taskId: "T-001-executor-1",
		role: "executor",
		title: "Task one",
		timestamp: 10,
	});
	runtime.recordSubagentUiEvent({
		type: "task.start",
		instanceId: "instance-1",
		taskId: "T-001-executor-1",
		definitionName: "executor",
		description: "Task one",
		timestamp: 11,
	});
	runtime.recordSubagentUiEvent({
		type: "progress.update",
		instanceId: "instance-1",
		taskId: "T-001-executor-1",
		message: "working",
		timestamp: 12,
	});

	const health = runtime.getSubagentHealth("T-001-executor-1");

	assert.equal(health.length, 1);
	assert.equal(health[0].status, "running");
	assert.deepEqual(
		health[0].lastEvents.map((event) => event.type),
		["task.start", "progress.update"],
	);
}

await testReporterPersistsAndForwardsEvents();
await testReporterFlagsCompleteWithoutApproval();
await testReporterSkipsSubagentNoiseInPlanLog();
testChecklistLoadsTasksDeclaratively();
testChecklistUpdatesStatusAndCounters();
testChecklistRejectsInvalidTasksShape();
testChecklistRejectsMissingTask();
testStructuredPlanLoadsRequiredFiles();
testStructuredPlanReadsContent();
testStructuredPlanRejectsMissingRequiredFile();
testStructuredPlanDelegatesChecklistUpdates();
testCoreRecordsRunAndFinishes();
testFinishRunMarksComplete();
testReviewerTagsParse();
testFeedbackDeliveryModes();
testPlanReviewPrompt();
await testPlanValidatorDelegationUsesExecutor();
testPlanningPromptDefinesAgentSizedTasks();
testLionSubagentWidgetRendering();
testLionSubagentWidgetCompletedAndCleanup();
testLionSubagentHealthTracksRecentEvents();
