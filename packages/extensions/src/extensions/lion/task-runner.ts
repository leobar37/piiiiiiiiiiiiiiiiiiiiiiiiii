import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ExecutionPlan, SubAgentCapabilities, TaskExecutionResult } from "@local/pi-subagents";
import { TaskExecutor } from "@local/pi-subagents";
import { LionEvents } from "./events/defs.js";
import { loadLionPlan } from "./plans/index.js";
import type { LionRuntime } from "./runtime.js";
import type { LionToolResponse } from "./tools.js";
import type { LionTask, LionTaskResult, LionTaskStrategy, LionTasksResult } from "./types.js";
import { renderLionSubagentWidget } from "./ui/subagents-widget.js";
import { createRunId } from "./utils.js";

export interface RunTasksParams {
	tasks: Array<{
		definition: string;
		title: string;
		prompt: string;
		capabilities?: Partial<SubAgentCapabilities>;
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

export class TaskRunner {
	constructor(private runtime: LionRuntime) {}

	async run(ctx: ExtensionContext, params: RunTasksParams): Promise<LionToolResponse> {
		if (!params.tasks || params.tasks.length === 0) {
			throw new Error(
				"lion_tasks requires at least one task. Provide tasks array with definitions, titles, and prompts.",
			);
		}

		const { runtime } = this;
		const activePlanPath = runtime.state.activePlanPath;
		const plan = activePlanPath ? loadLionPlan(activePlanPath) : null;
		runtime.rememberUiContext(ctx);

		const runId = createRunId();
		const bus = runtime.events;
		const taskConfigs = params.tasks;
		const strategy = params.strategy ?? "sequential";

		const batchTask: LionTask = {
			id: `tasks-${runId}`,
			title: `Batch ${strategy}: ${taskConfigs.length} tasks`,
			file: "",
			status: "pending",
			dependencies: [],
			requirements: [],
		};

		const controller = runtime.createSubAgentController(ctx, runId);

		for (let i = 0; i < taskConfigs.length; i++) {
			const taskId = `${runId}-task-${i}`;
			runtime.startJob({ runId, taskId, role: "executor", title: taskConfigs[i].title });
			runtime.startSubagentUi({ runId, taskId, role: "executor", title: taskConfigs[i].title });
		}
		renderLionSubagentWidget(runtime, ctx);

		const executor = new TaskExecutor({
			controller,
			onEvent: (event) => {
				runtime.recordSubagentUiEvent(event);
				if (!plan) return;
				bus.publish(LionEvents.subagentEvent, {
					runId,
					planSlug: plan.slug,
					planPath: plan.rootPath,
					taskId: batchTask.id,
					subagentEvent: event,
				});
			},
		});

		const executionPlan: ExecutionPlan = {
			strategy,
			tasks: taskConfigs.map((t, i) => ({
				id: `${runId}-task-${i}`,
				definition: t.definition,
				description: t.title,
				prompt: t.prompt,
				capabilities: t.capabilities,
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
			this.handleExecutionError(runId, taskConfigs, plan, error);
			renderLionSubagentWidget(runtime, ctx);
			return { run: runtime.core.activeRun };
		}

		this.publishEndEvents(runtime, plan, runId, taskConfigs, result);
		renderLionSubagentWidget(runtime, ctx);

		return {
			run: runtime.core.activeRun,
			tasks: this.buildTaskResults(result, taskConfigs),
		};
	}

	private publishStartEvents(
		bus: LionRuntime["events"],
		plan: NonNullable<ReturnType<typeof loadLionPlan>> | null,
		runId: string,
		strategy: LionTaskStrategy,
		taskConfigs: RunTasksParams["tasks"],
		concurrency?: number,
	): void {
		if (!plan) return;
		bus.publish(LionEvents.tasksStart, {
			runId,
			planSlug: plan.slug,
			planPath: plan.rootPath,
			strategy,
			taskCount: taskConfigs.length,
			concurrency,
		});
		for (let i = 0; i < taskConfigs.length; i++) {
			bus.publish(LionEvents.tasksTaskStart, {
				runId,
				planSlug: plan.slug,
				planPath: plan.rootPath,
				index: i,
				title: taskConfigs[i].title,
				definition: taskConfigs[i].definition,
			});
		}
	}

	private handleExecutionError(
		runId: string,
		taskConfigs: RunTasksParams["tasks"],
		plan: NonNullable<ReturnType<typeof loadLionPlan>> | null,
		error: string,
	): void {
		for (let i = 0; i < taskConfigs.length; i++) {
			const taskId = `${runId}-task-${i}`;
			this.runtime.finishJob(taskId, null, error);
			if (!plan) continue;
			this.runtime.events.publish(LionEvents.tasksTaskEnd, {
				runId,
				planSlug: plan.slug,
				planPath: plan.rootPath,
				index: i,
				title: taskConfigs[i].title,
				definition: taskConfigs[i].definition,
				status: "failed",
				summary: error,
			});
		}
	}

	private publishEndEvents(
		runtime: LionRuntime,
		plan: NonNullable<ReturnType<typeof loadLionPlan>> | null,
		runId: string,
		taskConfigs: RunTasksParams["tasks"],
		result: TaskExecutionResult,
	): void {
		for (let i = 0; i < result.results.length; i++) {
			const taskResult = result.results[i];
			runtime.finishJob(taskResult.taskId, taskResult, taskResult.error);
			if (!plan) continue;
			runtime.events.publish(LionEvents.tasksTaskEnd, {
				runId,
				planSlug: plan.slug,
				planPath: plan.rootPath,
				index: i,
				title: taskConfigs[i].title,
				definition: taskConfigs[i].definition,
				status: taskResult.status,
				summary: taskResult.summary,
			});
		}
		if (!plan) return;
		const lionResult = this.buildLionResult(runId, paramsStrategy(result), result, taskConfigs);
		runtime.events.publish(LionEvents.tasksComplete, {
			runId,
			planSlug: plan.slug,
			planPath: plan.rootPath,
			result: lionResult,
		});
	}

	private buildTaskResults(result: TaskExecutionResult, taskConfigs: RunTasksParams["tasks"]): LionTaskResult[] {
		return result.results.map((r, i) => ({
			taskId: r.taskId,
			title: taskConfigs[i].title,
			definition: taskConfigs[i].definition,
			status: r.status,
			summary: r.summary,
			duration: r.duration,
			turnCount: r.turnCount,
			error: r.error,
		}));
	}

	private buildLionResult(
		runId: string,
		strategy: LionTaskStrategy,
		result: TaskExecutionResult,
		taskConfigs: RunTasksParams["tasks"],
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
}

function paramsStrategy(result: TaskExecutionResult): LionTaskStrategy {
	return result.plan.strategy as LionTaskStrategy;
}
