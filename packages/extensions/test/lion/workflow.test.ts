import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	type DelegationResult,
	type DelegationTask,
	type SubAgentController,
	SubAgentEventBus,
} from "@local/pi-subagents";
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
import { buildPlanningSystemPrompt } from "../../src/extensions/lion/prompts/planning.js";
import { buildPlanValidationPrompt } from "../../src/extensions/lion/prompts/validator.js";
import {
	cleanupLionSubagentUi,
	createLionRuntime,
	getLionSubagentHealth,
	queueOrchestratorFeedback,
	recordLionSubagentUiEvent,
	retainSubagent,
	startLionSubagentJob,
	startLionSubagentUi,
} from "../../src/extensions/lion/runtime.js";
import { runReviewedExecutorWorkflow } from "../../src/extensions/lion/strategies/index.js";
import { parsePlanValidationVerdict } from "../../src/extensions/lion/strategies/plan-validation-verdict.js";
import { parseReviewVerdict } from "../../src/extensions/lion/strategies/review-verdict.js";
import { finishCurrentTaskRun, promptSubagent, startNextTask } from "../../src/extensions/lion/tools.js";
import type { LionPlan, LionPlanContent, LionTask } from "../../src/extensions/lion/types.js";
import { buildLionSubagentWidgetLines } from "../../src/extensions/lion/ui/subagents-widget.js";

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

const content: LionPlanContent = {
	context: "Context",
	requirements: "Requirements",
	taskIndex: "Task index",
	taskBrief: "Task brief",
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

function fakeController(summaries: string[], statuses: DelegationResult["status"][] = []): SubAgentController {
	let index = 0;
	return {
		executeTask: async (delegationTask: DelegationTask): Promise<DelegationResult> => {
			const summary = summaries[index] ?? "";
			const status = statuses[index] ?? "completed";
			index++;
			return delegationResult(delegationTask, status, summary);
		},
	} as unknown as SubAgentController;
}

async function runWorkflow(controller: SubAgentController, maxAttempts: number, events: any[] = []) {
	const bus = new LionEventBus();
	bus.on("*", (event) => events.push(event));
	return runReviewedExecutorWorkflow({
		runId: "run-1",
		plan,
		task,
		content,
		config: { maxAttempts },
		controller,
		bus,
		attempt: 1,
		prompt: "test prompt",
	});
}

async function testApprovedFirstAttempt(): Promise<void> {
	const events: any[] = [];
	const result = await runWorkflow(
		fakeController(["executor done", "findings\n\nLION_REVIEW_STATUS: approved"]),
		3,
		events,
	);

	assert.equal(result.status, "approved");
	assert.equal(result.attempts, 1);
	assert.equal(result.executorSummary, "executor done");
	assert.equal(result.reviewerSummary, "findings\n\nLION_REVIEW_STATUS: approved");
	assert.deepEqual(
		events
			.filter((event) => event.type === "lion.delegation.prompt.created")
			.map((event) => (event as any).payload?.agent ?? (event as any).agent),
		["executor", "reviewer"],
	);
	assert.equal(
		events.some((event) => event.type === "lion.task.approved"),
		true,
	);
	assert.equal(
		events.some((event) => event.type === "lion.task.marked_complete"),
		false,
	);
}

async function testCorrectionApprovedSecondAttempt(): Promise<void> {
	const events: any[] = [];
	const result = await runWorkflow(
		fakeController([
			"executor attempt 1",
			"missing validation\n\nLION_REVIEW_STATUS: rejected",
			"executor correction",
			"clean\n\nLION_REVIEW_STATUS: approved",
		]),
		3,
		events,
	);

	assert.equal(result.status, "approved");
	assert.equal(result.attempts, 2);
	assert.equal(result.executorSummary, "executor correction");
	assert.equal(events.filter((event) => event.type === "lion.correction.requested").length, 1);
	assert.deepEqual(
		events
			.filter((event) => event.type === "lion.review.verdict")
			.map((event) => (event as any).payload?.verdict ?? (event as any).verdict),
		["rejected", "approved"],
	);
}

async function testRejectedAfterMaxAttempts(): Promise<void> {
	const events: any[] = [];
	const result = await runWorkflow(
		fakeController([
			"executor attempt 1",
			"no\n\nLION_REVIEW_STATUS: rejected",
			"executor attempt 2",
			"still no\n\nLION_REVIEW_STATUS: rejected",
		]),
		2,
		events,
	);

	assert.equal(result.status, "rejected");
	assert.equal(result.attempts, 2);
	assert.equal(result.error, "Reviewer did not approve within max attempts.");
	assert.equal(events.at(-1)?.type, "lion.task.rejected");
}

async function testExecutorFailureFailsBuild(): Promise<void> {
	const result = await runWorkflow(fakeController(["executor cancelled"], ["cancelled"]), 3);

	assert.equal(result.status, "failed");
	assert.equal(result.attempts, 1);
	assert.equal(result.error, "Executor delegation ended with status cancelled.");
}

async function testUnknownReviewerVerdictRejects(): Promise<void> {
	const events: any[] = [];
	const result = await runWorkflow(fakeController(["executor done", "review did not include status"]), 1, events);

	assert.equal(result.status, "rejected");
	assert.deepEqual(
		events
			.filter((event) => event.type === "lion.review.verdict")
			.map((event) => (event as any).payload?.verdict ?? (event as any).verdict),
		["unknown"],
	);
}

function testReporterPersistsAndForwardsEvents(): void {
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

function testReporterFlagsCompleteWithoutApproval(): void {
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
		const lines = readFileSync(join(cwd, ".lion", "runs", "run-1.events.jsonl"), "utf-8")
			.trim()
			.split("\n");
		assert.equal(lines.length, 2);
		assert.equal(JSON.parse(lines[1]).type, "lion.rule.violation");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testReporterSkipsSubagentNoiseInPlanLog(): void {
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

async function testStartNextTaskBlocksActiveRun(): Promise<void> {
	const cwd = createStructuredPlanDir();
	try {
		const runtime = createLionRuntime(fakePi() as any);
		const loadedPlan = new StructuredLionPlanFile(cwd).loadPlan();
		runtime.state = {
			version: 1,
			active: true,
			mode: "building",
			activePlanPath: cwd,
			activePlanSlug: loadedPlan.slug,
			planKind: "structured",
			activeTaskId: "T-001",
			maxAttempts: 3,
			lastRunId: "run-1",
		};
		startRun(runtime.core, { runId: "run-1", plan: loadedPlan, task: loadedPlan.tasks[0], maxAttempts: 3 });

		await assert.rejects(
			() =>
				startNextTask(runtime, {
					cwd,
					hasUI: false,
					modelRegistry: {},
					isIdle: () => true,
				} as any),
			/active task run/,
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testStartNextTaskBlocksRunningSubagent(): Promise<void> {
	const cwd = createStructuredPlanDir();
	try {
		const runtime = createLionRuntime(fakePi() as any);
		const loadedPlan = new StructuredLionPlanFile(cwd).loadPlan();
		runtime.state = {
			version: 1,
			active: true,
			mode: "building",
			activePlanPath: cwd,
			activePlanSlug: loadedPlan.slug,
			planKind: "structured",
			activeTaskId: null,
			maxAttempts: 3,
			lastRunId: null,
		};
		startLionSubagentJob(runtime, {
			runId: "run-validator",
			taskId: "validate-test-plan",
			role: "validator",
			title: "Validate plan",
		});

		await assert.rejects(
			() =>
				startNextTask(runtime, {
					cwd,
					hasUI: false,
					modelRegistry: {},
					isIdle: () => true,
				} as any),
			/running sub-agent/,
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testFinishRequiresApprovedReviewerVerdict(): void {
	const cwd = createStructuredPlanDir();
	try {
		const runtime = createLionRuntime(fakePi() as any);
		const loadedPlan = new StructuredLionPlanFile(cwd).loadPlan();
		runtime.state = {
			version: 1,
			active: true,
			mode: "building",
			activePlanPath: cwd,
			activePlanSlug: loadedPlan.slug,
			planKind: "structured",
			activeTaskId: "T-001",
			maxAttempts: 3,
			lastRunId: "run-1",
		};
		startRun(runtime.core, { runId: "run-1", plan: loadedPlan, task: loadedPlan.tasks[0], maxAttempts: 3 });

		assert.throws(
			() => finishCurrentTaskRun(runtime, { cwd, ui: { setStatus: () => {} } } as any, "approved"),
			/before lion_start_review returns <LION-APPROVE>/,
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testFinishApprovedMarksCompleteAfterReview(): void {
	const cwd = createStructuredPlanDir();
	try {
		const runtime = createLionRuntime(fakePi() as any);
		const loadedPlan = new StructuredLionPlanFile(cwd).loadPlan();
		createLionRunReporter({ cwd } as any, runtime.events, { getActivePlanSlug: () => loadedPlan.slug });
		runtime.state = {
			version: 1,
			active: true,
			mode: "building",
			activePlanPath: cwd,
			activePlanSlug: loadedPlan.slug,
			planKind: "structured",
			activeTaskId: "T-001",
			maxAttempts: 3,
			lastRunId: "run-1",
		};
		startRun(runtime.core, { runId: "run-1", plan: loadedPlan, task: loadedPlan.tasks[0], maxAttempts: 3 });
		recordReviewVerdict(runtime.core, "approved", "ok\n<LION-APPROVE>");

		const response = finishCurrentTaskRun(runtime, { cwd, ui: { setStatus: () => {} } } as any, "approved");
		const record = readChecklistRecord(join(cwd, "checklist.json"));
		const lines = readFileSync(join(cwd, ".lion", "runs", "run-1.events.jsonl"), "utf-8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as any);

		assert.equal(response.result?.status, "approved");
		assert.equal(record.tasks[0].status, "complete");
		assert.deepEqual(
			lines.map((event) => event.type),
			["lion.task.approved", "lion.task.marked_complete", "lion.build.complete"],
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

function testReviewerTagsParse(): void {
	assert.equal(parseReviewVerdict("Looks good\n<LION-APPROVE>"), "approved");
	assert.equal(parseReviewVerdict("Issues remain\n<LION-REJECTED>"), "rejected");
	assert.equal(parseReviewVerdict("legacy\nLION_REVIEW_STATUS: approved"), "approved");
}

async function testPromptSubagentReusesRetainedInstance(): Promise<void> {
	const runtime = createLionRuntime(fakePi() as any);
	startRun(runtime.core, { runId: "run-1", plan, task, maxAttempts: 3 });
	retainSubagent(runtime, { runId: "run-1", role: "executor", taskId: "T-001-executor-1" });
	const bus = new SubAgentEventBus();
	const controller = {
		getEventBus: () => bus,
		promptInstance: async () => {
			queueMicrotask(() => {
				bus.emit({
					type: "task.end",
					instanceId: "instance-T-001-executor-1",
					taskId: "T-001-executor-1",
					result: delegationResult(
						{ id: "T-001-executor-1", definition: "executor", prompt: "follow up" },
						"completed",
						"follow-up answer",
					),
					timestamp: Date.now(),
				} as any);
			});
		},
	} as unknown as SubAgentController;
	runtime.controllers.set("run-1", controller);
	const response = await promptSubagent(
		runtime,
		{ isIdle: () => true, cwd: "/tmp" } as any,
		"T-001-executor-1",
		"clarify",
		"prompt",
	);

	assert.equal(response.run?.executorSummary, "follow-up answer");
	assert.equal(response.run?.attempts, 1);
}

function testFeedbackDeliveryModes(): void {
	const sends: Array<{ options: unknown }> = [];
	const runtime = createLionRuntime(
		fakePi({ sendMessage: (_message: unknown, options: unknown) => sends.push({ options }) }) as any,
	);
	queueOrchestratorFeedback(runtime, { isIdle: () => true } as any, "idle", {});
	queueOrchestratorFeedback(runtime, { isIdle: () => false } as any, "busy", {});

	assert.deepEqual(sends[0].options, { triggerTurn: true });
	assert.deepEqual(sends[1].options, { triggerTurn: true, deliverAs: "followUp" });
}

function testPlanValidationVerdictParser(): void {
	assert.equal(parsePlanValidationVerdict("Plan is coherent\n<LION-PLAN-VALID>"), "valid");
	assert.equal(parsePlanValidationVerdict("Missing acceptance criteria\n<LION-PLAN-NEEDS-WORK>"), "needs_work");
	assert.equal(parsePlanValidationVerdict("No tag"), "unknown");
}

async function testPlanValidatorDelegationUsesAnalyzer(): Promise<void> {
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
		definition: "analyzer",
		description: `Validate Lion plan ${plan.slug}`,
		prompt: buildPlanValidationPrompt(plan),
		systemPromptMode: "append",
		capabilities: { canEdit: false, canWrite: false, canExecute: false, canResearch: true },
		disabledTools: ["edit", "write", "multi-edit"],
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

function testPlanValidationPromptIsReadOnly(): void {
	const prompt = buildPlanValidationPrompt(plan, "requirements");

	assert.match(prompt, /read-only planning validation task/);
	assert.match(prompt, /Focus: requirements/);
	assert.match(prompt, /Do not edit files/);
	assert.match(prompt, /agent-sized rather than microtasks/);
	assert.match(prompt, /recommend consolidating tiny tasks before build/);
	assert.match(prompt, /<LION-PLAN-VALID>/);
	assert.match(prompt, /<LION-PLAN-NEEDS-WORK>/);
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
	const runtime = createLionRuntime(fakePi() as any);
	const now = Date.now();
	startLionSubagentUi(runtime, {
		runId: "run-1",
		taskId: "T-001-executor-1",
		role: "executor",
		title: "Task one",
		timestamp: now - 1000,
	});
	recordLionSubagentUiEvent(runtime, {
		type: "task.start",
		instanceId: "instance-1",
		taskId: "T-001-executor-1",
		definitionName: "executor",
		description: "Task one",
		timestamp: now - 900,
	});
	recordLionSubagentUiEvent(runtime, {
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
	const runtime = createLionRuntime(fakePi() as any);
	const now = Date.now();
	startLionSubagentUi(runtime, {
		runId: "run-1",
		taskId: "T-001-reviewer-1",
		role: "reviewer",
		title: "Review",
		timestamp: now - 2000,
	});
	recordLionSubagentUiEvent(runtime, {
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

	cleanupLionSubagentUi(runtime, now + 11000, 10000);
	assert.equal(runtime.subagentUi.size, 0);
}

function testLionSubagentHealthTracksRecentEvents(): void {
	const runtime = createLionRuntime(fakePi() as any);
	startLionSubagentJob(runtime, {
		runId: "run-1",
		taskId: "T-001-executor-1",
		role: "executor",
		title: "Task one",
		timestamp: 10,
	});
	recordLionSubagentUiEvent(runtime, {
		type: "task.start",
		instanceId: "instance-1",
		taskId: "T-001-executor-1",
		definitionName: "executor",
		description: "Task one",
		timestamp: 11,
	});
	recordLionSubagentUiEvent(runtime, {
		type: "progress.update",
		instanceId: "instance-1",
		taskId: "T-001-executor-1",
		message: "working",
		timestamp: 12,
	});

	const health = getLionSubagentHealth(runtime, "T-001-executor-1");

	assert.equal(health.length, 1);
	assert.equal(health[0].status, "running");
	assert.deepEqual(
		health[0].lastEvents.map((event) => event.type),
		["task.start", "progress.update"],
	);
}

await testApprovedFirstAttempt();
await testCorrectionApprovedSecondAttempt();
await testRejectedAfterMaxAttempts();
await testExecutorFailureFailsBuild();
await testUnknownReviewerVerdictRejects();
testReporterPersistsAndForwardsEvents();
testReporterFlagsCompleteWithoutApproval();
testReporterSkipsSubagentNoiseInPlanLog();
testChecklistLoadsTasksDeclaratively();
testChecklistUpdatesStatusAndCounters();
testChecklistRejectsInvalidTasksShape();
testChecklistRejectsMissingTask();
testStructuredPlanLoadsRequiredFiles();
testStructuredPlanReadsContent();
testStructuredPlanRejectsMissingRequiredFile();
testStructuredPlanDelegatesChecklistUpdates();
testCoreRecordsRunAndFinishes();
await testStartNextTaskBlocksActiveRun();
await testStartNextTaskBlocksRunningSubagent();
testFinishRequiresApprovedReviewerVerdict();
testFinishApprovedMarksCompleteAfterReview();
testReviewerTagsParse();
await testPromptSubagentReusesRetainedInstance();
testFeedbackDeliveryModes();
testPlanValidationVerdictParser();
await testPlanValidatorDelegationUsesAnalyzer();
testPlanValidationPromptIsReadOnly();
testPlanningPromptDefinesAgentSizedTasks();
testLionSubagentWidgetRendering();
testLionSubagentWidgetCompletedAndCleanup();
testLionSubagentHealthTracksRecentEvents();
