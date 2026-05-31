import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadLionPlan, resolvePlanPath } from "./plans/index.js";
import { buildPlanReviewPrompt } from "./prompts/index.js";
import type { LionRuntime } from "./runtime.js";
import { createRunId, formatPlanSummary } from "./utils.js";

export function registerLionCommands(pi: ExtensionAPI, runtime: LionRuntime): void {
	pi.registerCommand("lion-activate", {
		description: "Activate Lion planning/orchestration mode",
		handler: async (args, ctx) => {
			const runId = createRunId();
			const input = args.trim();
			runtime.emit({ type: "lion.activate.start", timestamp: Date.now(), runId, input });
			runtime.logState("command_lion_activate", { runId, input });

			if (!input) {
				runtime.activatePlanning();
				runtime.persist("activate");
				runtime.ui.updateStatus(ctx, runtime.state);
				// Ensure a persistent subagent controller exists from activation
				runtime.ensureController(ctx);
				runtime.attachMainSession(ctx);
				runtime.emit({
					type: "lion.activate.complete",
					timestamp: Date.now(),
					runId,
					strategy: runtime.state.strategy,
					phase: runtime.state.phase,
				});
				const content = runtime.state.activePlanSlug
					? [
							"Lion planning mode active.",
							`Plan: ${runtime.state.activePlanSlug}`,
							"Use lion_tasks with analyzer or planner delegations for non-trivial work.",
							"Do not implement application code directly.",
						].join("\n")
					: [
							"Lion planning mode active.",
							"No plan selected. I can help create or refine a structured plan, but I will not implement application code directly.",
							"Use lion_tasks with analyzer or planner delegations for non-trivial work.",
						].join("\n");
				const message = {
					customType: "lion-orchestrator-feedback" as const,
					content,
					display: false,
					details: {
						planSlug: runtime.state.activePlanSlug,
						phase: runtime.state.phase,
						nextTools: ["lion_tasks"],
					},
				};
				if (ctx.isIdle()) {
					pi.sendMessage(message, { triggerTurn: true });
				} else {
					pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
				}
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
				// Ensure a persistent subagent controller exists from activation
				runtime.ensureController(ctx);
				runtime.attachMainSession(ctx);
				const content = [
					"Lion planning mode active.",
					`Plan not found: ${input}`,
					"I can help create it if you authorize plan-file edits.",
					"Use lion_tasks with analyzer or planner delegations for non-trivial work.",
					"Do not implement application code directly.",
				].join("\n");
				const message = {
					customType: "lion-orchestrator-feedback" as const,
					content,
					display: false,
					details: {
						phase: runtime.state.phase,
						nextTools: ["lion_tasks"],
					},
				};
				if (ctx.isIdle()) {
					pi.sendMessage(message, { triggerTurn: true });
				} else {
					pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
				}
				runtime.ui.showMessage(
					`Lion planning mode active\n\nPlan not found: ${input}\n\nI can help create it if you authorize plan-file edits.`,
				);
				return;
			}

			const plan = loadLionPlan(planPath);
			runtime.activatePlan(plan);
			runtime.persist("activate");
			// Ensure a persistent subagent controller exists from activation
			runtime.ensureController(ctx);
			runtime.attachMainSession(ctx);
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
			runtime.emit({
				type: "lion.activate.complete",
				timestamp: Date.now(),
				runId,
				strategy: runtime.state.strategy,
				phase: runtime.state.phase,
			});
			const activateContent = [
				"Lion activated.",
				`Plan: ${plan.slug}`,
				"Use lion_tasks with analyzer or planner delegations for non-trivial work.",
				"Do not implement application code directly until /lion-build.",
			].join("\n");
			const activateMessage = {
				customType: "lion-orchestrator-feedback" as const,
				content: activateContent,
				display: false,
				details: {
					planSlug: plan.slug,
					planPath: plan.rootPath,
					phase: runtime.state.phase,
					nextTools: ["lion_tasks"],
				},
			};
			if (ctx.isIdle()) {
				pi.sendMessage(activateMessage, { triggerTurn: true });
			} else {
				pi.sendMessage(activateMessage, { triggerTurn: true, deliverAs: "followUp" });
			}
			runtime.ui.showMessage(`Lion activated\n\n${formatPlanSummary(plan)}`);
		},
	});

	pi.registerCommand("lion-simple", {
		description: "Activate Lion simple orchestration mode without a durable plan",
		handler: async (args, ctx) => {
			const runId = createRunId();
			const input = args.trim();
			runtime.emit({ type: "lion.activate.start", timestamp: Date.now(), runId, input });
			runtime.logState("command_lion_simple", { runId, input });
			runtime.activateSimple();
			runtime.persist("activate");
			runtime.ensureController(ctx);
			runtime.attachMainSession(ctx);
			runtime.ui.updateStatus(ctx, runtime.state);
			runtime.emit({
				type: "lion.activate.complete",
				timestamp: Date.now(),
				runId,
				strategy: runtime.state.strategy,
				phase: runtime.state.phase,
			});
			const content = input
				? [
						"Lion simple mode active.",
						input,
						"Use lion_tasks for non-trivial repository work.",
						"Do not implement application code directly unless it is trivial.",
					].join("\n")
				: [
						"Lion simple mode active.",
						"No durable plan will be created or required.",
						"Use lion_tasks for non-trivial repository work.",
						"Do not implement application code directly unless it is trivial.",
					].join("\n");
			const message = {
				customType: "lion-orchestrator-feedback" as const,
				content,
				display: false,
				details: {
					strategy: runtime.state.strategy,
					phase: runtime.state.phase,
					nextTools: ["lion_tasks"],
				},
			};
			if (ctx.isIdle()) {
				pi.sendMessage(message, { triggerTurn: true });
			} else {
				pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
			}
			runtime.ui.showMessage(
				input
					? `Lion simple mode active\n\n${input}`
					: "Lion simple mode active\n\nNo durable plan will be created or required.",
			);
		},
	});

	pi.registerCommand("lion-validate", {
		description: "Ask the orchestrator to validate the active Lion plan through lion_tasks",
		handler: async (args, ctx) => {
			const activePlanPath = runtime.state.activePlanPath;
			if (!activePlanPath) {
				runtime.ui.showMessage("Lion validate requires an active plan. Run /lion-activate <plan> first.");
				return;
			}
			if (runtime.state.phase !== "planning") {
				runtime.ui.showMessage("Lion validate can only run in planning mode.");
				return;
			}

			const focus = args.trim() || undefined;
			const plan = loadLionPlan(activePlanPath);
			runtime.logState("command_lion_validate", { focus });

			const content = [
				"Lion plan validation requested.",
				`Plan: ${plan.slug}`,
				`Path: ${plan.rootPath}`,
				focus ? `Focus: ${focus}` : "",
				"",
				"Use lion_tasks with one explicit validator delegation to validate this plan.",
				"Do not implement application code. Do not switch to build mode.",
				"Return the validator findings to the user after the tool call.",
				"",
				"Suggested delegation prompt:",
				buildPlanReviewPrompt(plan, focus),
			]
				.filter((line) => line !== "")
				.join("\n");

			const message = {
				customType: "lion-orchestrator-feedback",
				content,
				display: false,
				details: {
					planSlug: plan.slug,
					planPath: plan.rootPath,
					phase: runtime.state.phase,
					nextTools: ["lion_tasks"],
					role: "validator",
				},
			};

			if (ctx.isIdle()) {
				pi.sendMessage(message, { triggerTurn: true });
			} else {
				pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
			}

			runtime.ui.showMessage(`Lion validation requested for ${plan.slug}. Delegating through lion_tasks.`);
		},
	});

	pi.registerCommand("lion-build", {
		description: "Activate Lion build/execution mode",
		handler: async (_args, ctx) => {
			if (!runtime.state.active) {
				runtime.ui.showMessage("Lion is not active. Run /lion-activate or /lion-simple first.");
				return;
			}

			const isPlanMode = runtime.state.strategy === "plan";
			const activePlanPath = runtime.state.activePlanPath;

			if (isPlanMode && !activePlanPath) {
				runtime.ui.showMessage("Lion build requires an active plan. Run /lion-activate <plan> first.");
				return;
			}

			await ctx.waitForIdle();
			const runId = createRunId();
			runtime.logState("command_lion_build", { runId, planPath: activePlanPath, strategy: runtime.state.strategy });
			runtime.setPhase("building");
			runtime.persist("mode");
			runtime.ui.updateStatus(ctx, runtime.state);

			const content = isPlanMode
				? [
						"Lion build mode activated.",
						`Plan: ${runtime.state.activePlanSlug || activePlanPath}`,
						"The orchestrator is now in control of task execution.",
						'Immediately use lion_tasks with source: "active_plan_next_task" to select, execute, and record the next task.',
						"Do not implement application code directly in the main thread.",
					].join("\n")
				: [
						"Lion execution mode activated.",
						"Simple orchestration is active. No durable plan is required.",
						"Delegate work with lion_tasks and synthesize results in the main thread.",
						"Do not implement application code directly unless it is trivial.",
					].join("\n");

			const nextTools = ["lion_tasks"];

			const message = {
				customType: "lion-orchestrator-feedback",
				content,
				display: false,
				details: {
					runId,
					planSlug: runtime.state.activePlanSlug,
					planPath: activePlanPath,
					strategy: runtime.state.strategy,
					phase: "building",
					nextTools,
				},
			};

			if (ctx.isIdle()) {
				pi.sendMessage(message, { triggerTurn: true });
			} else {
				pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
			}

			const displayMessage = isPlanMode
				? `Lion build mode activated for ${runtime.state.activePlanSlug || activePlanPath}.`
				: "Lion execution mode activated. Delegate with lion_tasks.";
			runtime.ui.showMessage(displayMessage);
		},
	});

	pi.registerCommand("lion-dashboard", {
		description: "Open the Lion subagent dashboard in browser",
		handler: async (_args, ctx) => {
			try {
				if (!runtime.state.active) {
					runtime.activatePlanning();
					runtime.persist("activate");
					runtime.ui.updateStatus(ctx, runtime.state);
				}
				runtime.ensureController(ctx);
				runtime.attachMainSession(ctx);
				const url = await runtime.startDashboard();
				runtime.ui.showDashboardUrl(ctx, url);
				// Open browser using the system's default browser
				const openCommand =
					process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
				execFile(openCommand, [url.href], (err) => {
					if (!err) return;
					runtime.logError("lion-dashboard-open", err);
					runtime.ui.showMessage(`Failed to open browser automatically.\n\nURL: ${url.href}`);
				});
			} catch (err: unknown) {
				const error = err instanceof Error ? err.message : String(err);
				runtime.logError("lion-dashboard", err);
				runtime.ui.showMessage(`Failed to open Lion dashboard: ${error}`);
			}
		},
	});
}
