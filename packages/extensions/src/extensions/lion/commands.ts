import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createLionRunReporter } from "./events/index.js";
import { loadLionPlan, resolvePlanPath } from "./plans/index.js";
import type { LionRuntime } from "./runtime.js";
import { createRunId, formatPlanSummary } from "./utils.js";

export function registerLionCommands(pi: ExtensionAPI, runtime: LionRuntime): void {
	pi.registerCommand("lion-activate", {
		description: "Activate Lion planning/orchestration mode",
		handler: async (args, ctx) => {
			const runId = createRunId();
			createLionRunReporter(ctx, runtime.events);
			const input = args.trim();
			runtime.emit({ type: "lion.activate.start", timestamp: Date.now(), runId, input });

			if (!input) {
				runtime.activatePlanning();
				runtime.persist("activate");
				runtime.ui.updateStatus(ctx, runtime.state);
				runtime.emit({ type: "lion.activate.complete", timestamp: Date.now(), runId, mode: runtime.state.mode });
				runtime.ui.showMessage(
					runtime.state.activePlanSlug
						? `Lion planning mode active\n\n${runtime.state.activePlanSlug}`
						: "Lion planning mode active\n\nNo plan selected. I can help create or refine a structured plan, but I will not implement application code directly.",
				);
				return;
			}

			const planPath = resolvePlanPath(ctx.cwd, input);
			if (!planPath) {
				runtime.activatePlanning();
				runtime.persist("activate");
				runtime.ui.updateStatus(ctx, runtime.state);
				runtime.ui.showMessage(
					`Lion planning mode active\n\nPlan not found: ${input}\n\nI can help create it if you authorize plan-file edits.`,
				);
				return;
			}

			const plan = loadLionPlan(planPath);
			runtime.activatePlan(plan);
			runtime.persist("activate");
			runtime.ui.updateStatus(ctx, runtime.state);
			runtime.emit({
				type: "lion.plan.loaded",
				timestamp: Date.now(),
				runId,
				planSlug: plan.slug,
				planPath: plan.rootPath,
				taskCount: plan.tasks.length,
				kind: plan.kind,
			});
			runtime.emit({ type: "lion.activate.complete", timestamp: Date.now(), runId, mode: runtime.state.mode });
			runtime.ui.showMessage(`Lion activated\n\n${formatPlanSummary(plan)}`);
		},
	});

	pi.registerCommand("lion-build", {
		description: "Activate Lion build mode for the active plan",
		handler: async (_args, ctx) => {
			const activePlanPath = runtime.state.activePlanPath;
			if (!activePlanPath) {
				runtime.ui.showMessage("Lion build requires an active plan. Run /lion-activate <plan> first.");
				return;
			}

			await ctx.waitForIdle();
			const runId = createRunId();
			runtime.setMode("building");
			runtime.persist("mode");
			runtime.ui.updateStatus(ctx, runtime.state);

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

			runtime.ui.showMessage(`Lion build mode activated for ${runtime.state.activePlanSlug || activePlanPath}.`);
		},
	});
}
