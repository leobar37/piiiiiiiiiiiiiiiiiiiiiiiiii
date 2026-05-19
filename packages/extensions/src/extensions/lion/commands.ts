import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { LionEventBus, LionEventStore, LionRuleMonitor } from "./events/index.js";
import { persistLionState } from "./persistence.js";
import {
	getNextPendingTask,
	loadLionPlan,
	markStructuredTaskComplete,
	readPlanContent,
	resolvePlanPath,
	updateStructuredTaskStatus,
} from "./plans/index.js";
import { activatePlan, activatePlanning, applyBuildResult, setActiveTask, setLastRun, setMode } from "./state.js";
import { runLinearPipeline } from "./strategies/index.js";
import { createLionSubAgentController, runExecutorDelegation, runReviewerDelegation } from "./subagents/index.js";
import type { LionEvent, LionEventSink, LionState } from "./types.js";
import { showLionMessage, updateLionStatus } from "./ui.js";
import { createRunId, formatBuildResult, formatPlanSummary } from "./utils.js";

export interface LionRuntime {
	state: LionState;
}

function createEventSink(ctx: ExtensionCommandContext, bus: LionEventBus): LionEventSink {
	const store = new LionEventStore(ctx.cwd);
	const monitor = new LionRuleMonitor((event) => bus.emit(event));
	bus.on("*", (event: LionEvent) => {
		try {
			store.save(event);
		} catch {
			// Event logs are diagnostic; command behavior remains authoritative.
		}
		monitor.onEvent(event);
	});
	return (event) => bus.emit(event);
}

export function registerLionCommands(pi: ExtensionAPI, runtime: LionRuntime): void {
	pi.registerCommand("lion-activate", {
		description: "Activate Lion planning/orchestration mode",
		handler: async (args, ctx) => {
			const runId = createRunId();
			const bus = new LionEventBus();
			const emit = createEventSink(ctx, bus);
			const input = args.trim();
			emit({ type: "lion.activate.start", timestamp: Date.now(), runId, input });

			if (!input) {
				runtime.state = activatePlanning(runtime.state);
				persistLionState(pi, runtime.state, "activate");
				updateLionStatus(ctx, runtime.state);
				emit({ type: "lion.activate.complete", timestamp: Date.now(), runId, mode: runtime.state.mode });
				showLionMessage(
					pi,
					runtime.state.activePlanSlug
						? `Lion planning mode active\n\n${runtime.state.activePlanSlug}`
						: "Lion planning mode active\n\nNo plan selected. I can help create or refine a structured plan, but I will not implement application code directly.",
				);
				return;
			}

			const planPath = resolvePlanPath(ctx.cwd, input);
			if (!planPath) {
				runtime.state = activatePlanning(runtime.state);
				persistLionState(pi, runtime.state, "activate");
				updateLionStatus(ctx, runtime.state);
				showLionMessage(
					pi,
					`Lion planning mode active\n\nPlan not found: ${input}\n\nI can help create it if you authorize plan-file edits.`,
				);
				return;
			}

			const plan = loadLionPlan(planPath);
			runtime.state = activatePlan(runtime.state, plan);
			persistLionState(pi, runtime.state, "activate");
			updateLionStatus(ctx, runtime.state);
			emit({
				type: "lion.plan.loaded",
				timestamp: Date.now(),
				runId,
				planSlug: plan.slug,
				planPath: plan.rootPath,
				taskCount: plan.tasks.length,
				kind: plan.kind,
			});
			emit({ type: "lion.activate.complete", timestamp: Date.now(), runId, mode: runtime.state.mode });
			showLionMessage(pi, `Lion activated\n\n${formatPlanSummary(plan)}`);
		},
	});

	pi.registerCommand("lion-build", {
		description: "Execute the active Lion plan through executor/reviewer sub-agent delegation",
		handler: async (_args, ctx) => {
			const activePlanPath = runtime.state.activePlanPath;
			if (!activePlanPath) {
				showLionMessage(pi, "Lion build requires an active plan. Run /lion-activate <plan> first.");
				return;
			}

			await ctx.waitForIdle();
			const runId = createRunId();
			const bus = new LionEventBus();
			const emit = createEventSink(ctx, bus);
			runtime.state = setLastRun(setMode(runtime.state, "building"), runId);
			persistLionState(pi, runtime.state, "mode");
			updateLionStatus(ctx, runtime.state);

			try {
				const plan = loadLionPlan(activePlanPath);
				emit({
					type: "lion.build.start",
					timestamp: Date.now(),
					runId,
					planSlug: plan.slug,
					planPath: plan.rootPath,
				});
				const task = getNextPendingTask(plan);
				if (!task) {
					runtime.state = setMode(runtime.state, "planning");
					persistLionState(pi, runtime.state, "mode");
					updateLionStatus(ctx, runtime.state);
					showLionMessage(pi, `Lion build complete\n\nNo pending unblocked tasks in ${plan.slug}.`);
					return;
				}

				runtime.state = setActiveTask(runtime.state, task.id);
				updateStructuredTaskStatus(plan, task.id, "in_progress");
				persistLionState(pi, runtime.state, "build");
				emit({
					type: "lion.task.selected",
					timestamp: Date.now(),
					runId,
					planSlug: plan.slug,
					planPath: plan.rootPath,
					taskId: task.id,
					title: task.title,
				});
				const content = readPlanContent(plan, task);
				const controller = createLionSubAgentController({ ctx, runId, plan, task, emit });
				const runner = {
					runExecutor: (prompt: string, attempt: number) =>
						runExecutorDelegation({ controller, runId, plan, task, attempt, prompt, emit }),
					runReviewer: (prompt: string, attempt: number) =>
						runReviewerDelegation({ controller, runId, plan, task, attempt, prompt, emit }),
				};
				const result = await runLinearPipeline({
					runId,
					plan,
					task,
					content,
					config: { maxAttempts: runtime.state.maxAttempts },
					runner,
					emit,
				});

				if (result.status === "approved") {
					markStructuredTaskComplete(plan, task.id);
					emit({
						type: "lion.task.marked_complete",
						timestamp: Date.now(),
						runId,
						planSlug: plan.slug,
						planPath: plan.rootPath,
						taskId: task.id,
					});
				}
				if (result.status !== "approved") {
					updateStructuredTaskStatus(plan, task.id, "blocked");
				}

				runtime.state = applyBuildResult(runtime.state, result);
				persistLionState(pi, runtime.state, "build");
				updateLionStatus(ctx, runtime.state);
				emit({
					type: "lion.build.complete",
					timestamp: Date.now(),
					runId,
					planSlug: plan.slug,
					planPath: plan.rootPath,
					taskId: task.id,
					result,
				});
				showLionMessage(pi, `Lion build result\n\n${formatBuildResult(result)}`);
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				emit({ type: "lion.build.failed", timestamp: Date.now(), runId, error });
				runtime.state = setMode(runtime.state, "planning");
				persistLionState(pi, runtime.state, "build");
				updateLionStatus(ctx, runtime.state);
				showLionMessage(pi, `Lion build failed\n\n${error}`);
			}
		},
	});
}
