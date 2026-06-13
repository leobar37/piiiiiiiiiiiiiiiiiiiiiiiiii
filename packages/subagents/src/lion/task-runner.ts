import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TaskExecutionResult } from "../task-executor.js";
import { TaskExecutor } from "../task-executor.js";
import type { ExecutionPlan, SubAgentCapabilities } from "../types.js";
import { LionChecklistService } from "./checklist-service.js";
import { addSyntheticRun, type LionRun, type LionSubagentRole } from "./core.js";
import { LionEvents } from "./events/defs.js";
import { classifyLionTaskResult } from "./evidence.js";
import { loadLionPlan } from "./plans/index.js";
import type { LionRuntime } from "./runtime.js";
import { getLionStrategy } from "./strategies/index.js";
import { escapeXml } from "./strategies/shared.js";
import type { LionToolResponse } from "./tools.js";
import type { LionTask, LionTaskResult, LionTaskStrategy, LionTasksResult } from "./types.js";
import { renderLionSubagentWidget } from "./ui/subagents-widget.js";
import { createRunId } from "./utils.js";

export interface RunTasksParams {
	source?: "active_plan_next_task";
	role?: "analyzer" | "planner" | "executor" | "reviewer" | "validator";
	tasks?: Array<{
		definition: string;
		title: string;
		prompt: string;
		capabilities?: Partial<SubAgentCapabilities>;
		tools?: string[];
		disabledTools?: string[];
		skillPaths?: string[];
	}>;
	strategy?: LionTaskStrategy;
	concurrency?: number;
	chainOptions?: {
		passOutputToNext?: boolean;
		outputMode?: "append" | "replace" | "template";
		template?: string;
		stopOnFailure?: boolean;
	};
}

export interface RunTasksParent {
	threadId: string;
	toolCallId?: string;
}

type PreparedTaskConfig = NonNullable<RunTasksParams["tasks"]>[number];

export class TaskRunner {
	private checklistService = new LionChecklistService();

	constructor(private runtime: LionRuntime) {}

	async runActivePlanBuild(ctx: ExtensionContext, parent: RunTasksParent): Promise<LionToolResponse[]> {
		const responses: LionToolResponse[] = [];
		for (;;) {
			let response: LionToolResponse;
			try {
				response = await this.run(
					ctx,
					{ source: "active_plan_next_task", role: "executor", strategy: "sequential" },
					parent,
				);
			} catch (err: unknown) {
				if (err instanceof Error && err.message === "No executable task is available in the active Lion plan.") {
					return responses;
				}
				throw err;
			}

			responses.push(response);
			const shouldContinue =
				response.tasks?.length &&
				response.tasks.every((task) => task.status === "completed" && task.verificationStatus === "verified");
			if (!shouldContinue) return responses;
		}
	}

	async run(ctx: ExtensionContext, params: RunTasksParams, parent: RunTasksParent): Promise<LionToolResponse> {
		const { runtime } = this;
		const activePlanPath = runtime.state.activePlanPath;
		const plan = activePlanPath && runtime.state.strategy === "plan" ? loadLionPlan(activePlanPath) : null;
		const cwd = ctx.cwd ?? ctx.sessionManager.getCwd();
		const runId = createRunId();
		runtime.rememberUiContext(ctx);

		this.validateActivePlanSourceRole(params);
		const selectedPlanTask =
			params.source === "active_plan_next_task" ? this.selectActivePlanTask(plan, cwd, runId) : null;
		const rawTaskConfigs = this.resolveRequestedTasks(params, selectedPlanTask);

		const bus = runtime.events;
		const taskConfigs = rawTaskConfigs
			.map((task) => this.applyPhasePolicy(task))
			.map((task) => getLionStrategy(runtime.state.strategy).decorateTaskPrompt(task, { plan }));
		const strategy = params.strategy ?? "sequential";

		// Initialize structured run logger for this batch
		const runLogger = runtime.initRunLogger(cwd, runId);
		runLogger.startRun({
			planSlug: plan?.slug ?? runtime.state.activePlanSlug,
			planPath: plan?.rootPath ?? runtime.state.activePlanPath,
			tasksTotal: taskConfigs.length,
		});

		const batchTask: LionTask = {
			id: `tasks-${runId}`,
			title: `Batch ${strategy}: ${taskConfigs.length} tasks`,
			file: "",
			status: "pending",
			dependencies: [],
			requirements: [],
		};

		const controller = runtime.ensureController(ctx);

		for (let i = 0; i < taskConfigs.length; i++) {
			const taskId = `${runId}-task-${i}`;
			const role = this.inferRoleFromDefinition(taskConfigs[i].definition);
			runtime.startJob({ runId, taskId, role, title: taskConfigs[i].title });
			runtime.startSubagentUi({ runId, taskId, role, title: taskConfigs[i].title });
		}
		renderLionSubagentWidget(runtime, ctx);

		const executor = new TaskExecutor({
			controller,
			onEvent: (event) => {
				runtime.recordSubagentUiEvent(event);
				// Log full subagent events to structured run logger (per-task file)
				if ("taskId" in event) {
					runtime.runLogger?.logSubagent(event.taskId, {
						type: "event",
						source: "subagent",
						data: event,
					});
				}
				if (!plan) return;
				bus.emit(
					LionEvents.subagentEvent({
						runId,
						planSlug: plan.slug,
						planPath: plan.rootPath,
						taskId: batchTask.id,
						subagentEvent: event,
					}),
				);
			},
		});

		const executionPlan: ExecutionPlan = {
			strategy,
			tasks: taskConfigs.map((t, i) => ({
				id: `${runId}-task-${i}`,
				definition: t.definition,
				parentThreadId: parent.threadId,
				parentToolCallId: parent.toolCallId,
				runId,
				runIndex: i,
				description: t.title,
				prompt: t.prompt,
				capabilities: t.capabilities,
				tools: t.tools,
				disabledTools: t.disabledTools,
				skillPaths: t.skillPaths,
				orchestration: {
					strategy: runtime.state.strategy,
					...(plan ? { planSlug: plan.slug, planPath: plan.rootPath } : {}),
				},
			})),
			concurrency: params.concurrency,
			chainOptions: params.chainOptions,
		};

		this.publishStartEvents(bus, plan, runId, strategy, taskConfigs, params.concurrency);

		let result: TaskExecutionResult;
		try {
			result = await executor.execute(executionPlan);
		} catch (err: unknown) {
			const error = err instanceof Error ? err.message : String(err);
			const isRetryable = isRetryableOrchestrationFailure(error);
			this.handleExecutionError(runId, taskConfigs, plan, error);
			renderLionSubagentWidget(runtime, ctx);
			runtime.completeRun("failed", error);
			const failedResult: TaskExecutionResult = {
				plan: executionPlan,
				results: taskConfigs.map((t, i) => ({
					taskId: `${runId}-task-${i}`,
					agent: t.definition,
					status: "failed" as const,
					summary: error,
					structuredResult: false,
					duration: 0,
					turnCount: 0,
					finalState: {
						instanceId: `subagent-${runId}-task-${i}-failed`,
						taskId: `${runId}-task-${i}`,
						definitionName: t.definition,
						cwd,
						state: "failed" as const,
						startTime: null,
						endTime: Date.now(),
						turnCount: 0,
						lastActivityAt: Date.now(),
						currentTool: null,
						error,
						toolCount: 0,
						currentToolStartedAt: null,
						durationMs: 0,
					},
				})),
				completedAt: Date.now(),
			};
			const run =
				runtime.core.activeRun ?? this.buildSyntheticRun(runId, strategy, batchTask, failedResult, taskConfigs);
			if (selectedPlanTask && plan) {
				this.recordPlanChecklistResult(
					cwd,
					selectedPlanTask.id,
					isRetryable ? "retryable" : "blocked",
					error,
					runId,
				);
				this.runtime.setActiveTask(null);
			}
			if (isRetryable) {
				runtime.queueFeedback(ctx, buildRetryableOrchestrationFeedback(error), {
					runId,
					reason: error,
					nextTools: ["lion_tasks"],
					retryable: true,
				});
			}
			return {
				run,
				tasks: this.buildTaskResults(failedResult, taskConfigs),
				nextTask: selectedPlanTask,
				plan: selectedPlanTask && activePlanPath ? loadLionPlan(activePlanPath) : (plan ?? undefined),
			};
		}

		if (selectedPlanTask) {
			this.recordSelectedPlanTaskResult(plan, selectedPlanTask.id, result, cwd, runId);
		}
		this.publishEndEvents(runtime, plan, runId, strategy, taskConfigs, result);
		renderLionSubagentWidget(runtime, ctx);

		// Mark run as completed in structured logger
		const allCompleted = result.results.every((r) => r.status === "completed");
		const anyFailed = result.results.some((r) => r.status === "failed");
		if (allCompleted) {
			runtime.completeRun("completed");
		} else if (anyFailed) {
			runtime.completeRun("failed", `${result.results.filter((r) => r.status === "failed").length} task(s) failed`);
		} else {
			runtime.completeRun("completed");
		}

		const run = runtime.core.activeRun ?? this.buildSyntheticRun(runId, strategy, batchTask, result, taskConfigs);

		// Persist synthetic run to core history for simple mode
		if (!runtime.core.activeRun) {
			addSyntheticRun(runtime.core, run);
		}

		return {
			run,
			tasks: this.buildTaskResults(result, taskConfigs),
			nextTask: selectedPlanTask,
			plan: selectedPlanTask && activePlanPath ? loadLionPlan(activePlanPath) : (plan ?? undefined),
		};
	}

	private resolveRequestedTasks(params: RunTasksParams, selectedPlanTask: LionTask | null): PreparedTaskConfig[] {
		if (params.source && params.tasks?.length) {
			throw new Error("lion_tasks accepts either source or tasks, not both.");
		}
		if (params.source === "active_plan_next_task") {
			if (!selectedPlanTask) {
				throw new Error("No executable task is available in the active Lion plan.");
			}
			const role = params.role ?? "executor";
			return [
				{
					definition: role,
					title: `${selectedPlanTask.id}: ${selectedPlanTask.title}`,
					prompt: this.buildActivePlanTaskPrompt(selectedPlanTask, role),
				},
			];
		}
		if (!params.tasks || params.tasks.length === 0) {
			throw new Error("lion_tasks requires tasks or source: active_plan_next_task.");
		}
		return params.tasks;
	}

	private validateActivePlanSourceRole(params: RunTasksParams): void {
		if (params.source !== "active_plan_next_task") return;
		const role = params.role ?? "executor";
		if (role !== "executor") {
			throw new Error(
				"active_plan_next_task can only run executor tasks. Use explicit tasks for analysis or review.",
			);
		}
	}

	private selectActivePlanTask(
		plan: ReturnType<typeof loadLionPlan> | null,
		cwd: string,
		runId: string,
	): LionTask | null {
		if (this.runtime.state.strategy !== "plan") {
			throw new Error("active_plan_next_task requires Lion plan mode.");
		}
		if (this.runtime.state.phase !== "building") {
			throw new Error("active_plan_next_task requires /lion-build in plan mode.");
		}
		if (!plan) {
			throw new Error("active_plan_next_task requires an active plan. Run /lion-activate <plan> first.");
		}
		const { checklist, task } = this.checklistService.startNext({
			kind: "plan",
			activePlanPath: plan.rootPath,
			cwd,
		});
		if (task) {
			this.runtime.setActiveTask(task.id);
			this.runtime.emit(
				LionEvents.checklistTaskStarted({
					runId,
					kind: checklist.kind,
					slug: checklist.slug,
					rootPath: checklist.rootPath,
					checklist,
					taskId: task.id,
				}),
			);
		}
		return task;
	}

	private buildActivePlanTaskPrompt(task: LionTask, role: string): string {
		const planPath = this.runtime.state.activePlanPath ?? "";
		const taskFile = task.file ? `${planPath}/${task.file}` : "";
		return [
			"<delegation>",
			`  <role>${escapeXml(role)}</role>`,
			`  <plan path="${escapeXml(planPath)}" task_id="${escapeXml(task.id)}" task_file="${escapeXml(taskFile)}" />`,
			`  <objective>${escapeXml(task.title)}</objective>`,
			"  <constraints>",
			"    <must>Use the active plan and task file as the source of truth.</must>",
			"    <must_not>Ask the user for clarification.</must_not>",
			"    <must_not>Wait for external input.</must_not>",
			"  </constraints>",
			"  <output>",
			"    <must_return>Summary, files changed or inspected, validation evidence, risks, and unknowns.</must_return>",
			"  </output>",
			"</delegation>",
		].join("\n");
	}

	private applyPhasePolicy(task: PreparedTaskConfig): PreparedTaskConfig {
		const state = this.runtime.state;
		if (state.strategy === "none" || state.strategy === "simple") return task;

		if (state.strategy === "review") {
			if (task.definition === "executor") {
				throw new Error("executor tasks are not allowed in Lion review mode.");
			}
			if (state.phase === "planning") {
				if (!isReviewPlanningRole(task.definition)) {
					throw new Error(`${task.definition} tasks require /lion-build in review mode.`);
				}
				return this.#asReadOnlyTask(task);
			}
			return {
				...task,
				capabilities: {
					...task.capabilities,
					canEdit: false,
					canWrite: false,
					canExecute: task.definition === "reviewer" || task.definition === "validator",
				},
				disabledTools: uniqueStrings([...(task.disabledTools ?? []), "edit", "write", "multi-edit"]),
			};
		}

		// plan mode
		if (state.phase === "planning") {
			if (!isPlanningRole(task.definition)) {
				throw new Error(`${task.definition} tasks require /lion-build in plan mode.`);
			}
			return this.#asReadOnlyTask(task);
		}

		return task;
	}

	#asReadOnlyTask(task: PreparedTaskConfig): PreparedTaskConfig {
		return {
			...task,
			capabilities: {
				...task.capabilities,
				canEdit: false,
				canWrite: false,
				canExecute: false,
			},
			tools: ["read", "glob", "grep"],
			disabledTools: ["edit", "write", "multi-edit", "bash"],
		};
	}

	private recordSelectedPlanTaskResult(
		plan: ReturnType<typeof loadLionPlan> | null,
		taskId: string,
		result: TaskExecutionResult,
		cwd: string,
		runId: string,
	): void {
		if (!plan) return;
		const summary = result.results.map((item) => item.summary).join("\n\n");
		const classifications = result.results.map((item) => classifyLionTaskResult(item));
		const canComplete = result.results.every((item, index) => {
			return (
				item.status === "completed" &&
				item.structuredResult &&
				classifications[index].verificationStatus === "verified"
			);
		});
		const blocked = classifications.some((item) => item.verificationStatus === "blocked");
		const failed = classifications.some((item) => item.verificationStatus === "failed");
		const status = canComplete ? "complete" : failed || blocked ? "blocked" : "retryable";
		const gateSummary = canComplete
			? summary
			: [
					"Lion completion gate did not pass.",
					"",
					...result.results.map((item, index) =>
						[
							`Task ${item.taskId}:`,
							`- status: ${item.status}`,
							`- structuredResult: ${item.structuredResult}`,
							`- verificationStatus: ${classifications[index].verificationStatus}`,
							`- summary: ${item.summary}`,
						].join("\n"),
					),
				].join("\n");
		this.recordPlanChecklistResult(cwd, taskId, status, gateSummary, runId);
		this.runtime.setActiveTask(null);
	}

	private recordPlanChecklistResult(
		cwd: string,
		taskId: string,
		status: "complete" | "blocked" | "retryable",
		summary: string,
		runId = this.runtime.state.lastRunId ?? `checklist-${Date.now()}`,
	): void {
		const { checklist } = this.checklistService.recordResult({
			kind: "plan",
			activePlanPath: this.runtime.state.activePlanPath,
			cwd,
			taskId,
			status,
			summary,
		});
		this.runtime.emit(
			LionEvents.checklistTaskRecorded({
				runId,
				kind: checklist.kind,
				slug: checklist.slug,
				rootPath: checklist.rootPath,
				checklist,
				taskId,
				status,
				summary,
			}),
		);
	}

	private publishStartEvents(
		bus: LionRuntime["events"],
		plan: NonNullable<ReturnType<typeof loadLionPlan>> | null,
		runId: string,
		strategy: LionTaskStrategy,
		taskConfigs: PreparedTaskConfig[],
		concurrency?: number,
	): void {
		bus.emit(
			LionEvents.tasksStart({
				runId,
				planSlug: plan?.slug ?? "",
				planPath: plan?.rootPath ?? "",
				strategy,
				taskCount: taskConfigs.length,
				concurrency,
			}),
		);
		for (let i = 0; i < taskConfigs.length; i++) {
			bus.emit(
				LionEvents.tasksTaskStart({
					runId,
					planSlug: plan?.slug ?? "",
					planPath: plan?.rootPath ?? "",
					index: i,
					title: taskConfigs[i].title,
					definition: taskConfigs[i].definition,
				}),
			);
		}
	}

	private handleExecutionError(
		runId: string,
		taskConfigs: PreparedTaskConfig[],
		plan: NonNullable<ReturnType<typeof loadLionPlan>> | null,
		error: string,
	): void {
		for (let i = 0; i < taskConfigs.length; i++) {
			const taskId = `${runId}-task-${i}`;
			this.runtime.finishJob(taskId, null, error);
			this.runtime.subagentUi.delete(taskId);
			this.runtime.events.emit(
				LionEvents.tasksTaskEnd({
					runId,
					planSlug: plan?.slug ?? "",
					planPath: plan?.rootPath ?? "",
					index: i,
					title: taskConfigs[i].title,
					definition: taskConfigs[i].definition,
					status: "failed",
					summary: error,
				}),
			);
		}
		this.runtime.cleanupSubagentUi(Date.now(), 5000);
		renderLionSubagentWidget(this.runtime, this.runtime.lastUiContext ?? undefined);
	}

	private publishEndEvents(
		runtime: LionRuntime,
		plan: NonNullable<ReturnType<typeof loadLionPlan>> | null,
		runId: string,
		strategy: LionTaskStrategy,
		taskConfigs: PreparedTaskConfig[],
		result: TaskExecutionResult,
	): void {
		for (let i = 0; i < result.results.length; i++) {
			const taskResult = result.results[i];
			runtime.finishJob(taskResult.taskId, taskResult, taskResult.error);
			runtime.events.emit(
				LionEvents.tasksTaskEnd({
					runId,
					planSlug: plan?.slug ?? "",
					planPath: plan?.rootPath ?? "",
					index: i,
					title: taskConfigs[i].title,
					definition: taskConfigs[i].definition,
					status: taskResult.status,
					summary: taskResult.summary,
				}),
			);
		}
		const lionResult = this.buildLionResult(runId, strategy, result, taskConfigs);
		runtime.events.emit(
			LionEvents.tasksComplete({
				runId,
				planSlug: plan?.slug ?? "",
				planPath: plan?.rootPath ?? "",
				result: lionResult,
			}),
		);
	}

	private buildTaskResults(result: TaskExecutionResult, taskConfigs: PreparedTaskConfig[]): LionTaskResult[] {
		return result.results.map((r, i) => {
			const classification = classifyLionTaskResult(r);
			return {
				taskId: r.taskId,
				title: taskConfigs[i].title,
				definition: taskConfigs[i].definition,
				status: r.status,
				verificationStatus: classification.verificationStatus,
				evidence: classification.evidence,
				summary: r.summary,
				recordedResult: r.recordedResult,
				duration: r.duration,
				turnCount: r.turnCount,
				error: r.error,
			};
		});
	}

	private buildLionResult(
		runId: string,
		strategy: LionTaskStrategy,
		result: TaskExecutionResult,
		taskConfigs: PreparedTaskConfig[],
	): LionTasksResult {
		return {
			runId,
			strategy,
			tasks: this.buildTaskResults(result, taskConfigs),
			completedCount: result.results.filter((r) => r.status === "completed").length,
			failedCount: result.results.filter((r) => r.status === "failed").length,
			completedAt: result.completedAt,
		};
	}

	private buildSyntheticRun(
		runId: string,
		_strategy: LionTaskStrategy,
		batchTask: LionTask,
		result: TaskExecutionResult,
		taskConfigs?: PreparedTaskConfig[],
	): LionRun {
		const allCompleted = result.results.every((r) => r.status === "completed");
		const anyFailed = result.results.some((r) => r.status === "failed");
		const now = Date.now();
		return {
			runId,
			planSlug: "",
			planPath: "",
			taskId: batchTask.id,
			taskTitle: batchTask.title,
			status: allCompleted ? "approved" : anyFailed ? "failed" : "awaiting_orchestrator",
			attempts: 1,
			maxAttempts: 1,
			executorTaskId: null,
			reviewerTaskId: null,
			executorSummary: "",
			reviewerSummary: "",
			verdict: null,
			error: anyFailed ? `${result.results.filter((r) => r.status === "failed").length} task(s) failed` : null,
			subagents: result.results.map((r, i) => {
				const definition = taskConfigs?.[i]?.definition ?? "";
				const role = this.inferRoleFromDefinition(definition);
				return {
					role,
					taskId: r.taskId,
					instanceId: r.finalState.instanceId,
					status: r.status,
					summary: r.summary,
					updatedAt: now,
				};
			}),
			createdAt: now,
			updatedAt: now,
		};
	}

	private inferRoleFromDefinition(definition: string): LionSubagentRole {
		switch (definition) {
			case "analyzer":
				return "analyzer";
			case "planner":
				return "planner";
			case "reviewer":
				return "reviewer";
			case "validator":
				return "validator";
			default:
				return "executor";
		}
	}
}

function isRetryableOrchestrationFailure(error: string): boolean {
	return /Delegation depth limit|No subagent activity|AgentHarness is busy|subagent activity|stalled/i.test(error);
}

function buildRetryableOrchestrationFeedback(error: string): string {
	return [
		"Lion delegation infrastructure failed before a reliable task outcome was produced.",
		"",
		`Reason: ${error}`,
		"",
		"Retry the current task with lion_tasks. Treat the active plan task as retryable, not blocked.",
	].join("\n");
}

function isPlanningRole(definition: string): boolean {
	return (
		definition === "analyzer" || definition === "planner" || definition === "reviewer" || definition === "validator"
	);
}

function isReviewPlanningRole(definition: string): boolean {
	return definition === "analyzer" || definition === "planner";
}

function uniqueStrings(values: string[]): string[] {
	return Array.from(new Set(values));
}
