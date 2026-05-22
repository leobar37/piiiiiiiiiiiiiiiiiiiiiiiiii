import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { LionEventBus, LionEventStore, LionRuleMonitor } from "./events/index.js";
import { persistLionState } from "./persistence.js";
import { loadLionPlan, resolvePlanPath } from "./plans/index.js";
import { activatePlan, activatePlanning, setMode } from "./state.js";
import type { LionEvent, LionEventSink, LionState } from "./types.js";
import { showLionMessage, updateLionStatus } from "./ui.js";
import { createRunId, formatPlanSummary } from "./utils.js";

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
		description: "Activate Lion build mode for the active plan",
		handler: async (_args, ctx) => {
			const activePlanPath = runtime.state.activePlanPath;
			if (!activePlanPath) {
				showLionMessage(pi, "Lion build requires an active plan. Run /lion-activate <plan> first.");
				return;
			}

			await ctx.waitForIdle();
			const runId = createRunId();
			runtime.state = setMode(runtime.state, "building");
			persistLionState(pi, runtime.state, "mode");
			updateLionStatus(ctx, runtime.state);

			const message = {
				customType: "lion-orchestrator-feedback",
				content: [
					"Lion build mode activated.",
					`Plan: ${runtime.state.activePlanSlug || activePlanPath}`,
					"The orchestrator is now in control of task execution.",
					"Use lion_tasks to execute one or more tasks with parallel, sequential, or chain strategy.",
					"After tasks complete, you may call lion_finish_current_task to mark complete.",
				].join("\n"),
				display: false,
				details: {
					runId,
					planSlug: runtime.state.activePlanSlug,
					planPath: activePlanPath,
					mode: "building",
					nextTools: ["lion_tasks", "lion_task_list", "lion_get_run"],
				},
			};

			if (ctx.isIdle()) {
				pi.sendMessage(message, { triggerTurn: true });
			} else {
				pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
			}

			showLionMessage(pi, `Lion build mode activated for ${runtime.state.activePlanSlug || activePlanPath}.`);
		},
	});
}
