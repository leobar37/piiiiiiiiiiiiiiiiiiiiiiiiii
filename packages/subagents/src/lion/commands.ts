import { execFile } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildCodeReviewTodo, buildPlanCodeReviewTodo, collectCodeReviewGitContext } from "./code-review.js";
import { loadLionPlan, resolvePlanPath } from "./plans/index.js";
import { buildPlanReviewPrompt } from "./prompts/index.js";
import { createReviewPlanFromTodo, loadReviewPlan } from "./review-plan.js";
import type { LionRuntime } from "./runtime.js";
import { matchStrategyOnly } from "./strategy-match.js";
import { TaskRunner } from "./task-runner.js";
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
				runtime.persist();
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
				const content = [
					"Lion planning mode active.",
					"No plan selected. Treat this as a request to create a new structured plan from the current conversation.",
					"Do not activate an existing plan unless the user names a plan reference.",
					"Use lion_tasks with analyzer or planner delegations for non-trivial work.",
				].join("\n");
				const message = {
					customType: "lion-orchestrator-feedback" as const,
					content,
					display: false,
					details: {
						planSlug: null,
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
					"Lion planning mode active\n\nNo plan selected. Create a new structured plan from the current conversation.",
				);
				return;
			}

			const planPath = resolvePlanPath(ctx.cwd, input);
			if (!planPath) {
				runtime.activatePlanning();
				runtime.persist();
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
			runtime.persist();
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
			runtime.persist();
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

	pi.registerCommand("lion-code-review", {
		description: "Activate Lion code review strategy and create a durable read-only review plan",
		handler: async (args, ctx) => {
			const runId = createRunId();
			const input = args.trim();
			const cwd = ctx.cwd ?? ctx.sessionManager.getCwd();
			runtime.logState("command_lion_code_review", { runId, input, cwd });

			const git = await collectCodeReviewGitContext(cwd);
			const todo = buildCodeReviewTodo({ scope: input, git });
			const reviewPlan = createReviewPlanFromTodo(cwd, { slug: input, todo });
			runtime.activateReview({
				kind: "structured",
				slug: reviewPlan.slug,
				rootPath: reviewPlan.rootPath,
				contextFile: reviewPlan.contextFile,
				indexFile: reviewPlan.indexFile,
				checklistFile: reviewPlan.checklistFile,
				tasks: reviewPlan.tasks,
			});
			runtime.persist();
			runtime.ensureController(ctx);
			runtime.attachMainSession(ctx);
			runtime.ui.updateStatus(ctx, runtime.state);
			runtime.emit({
				type: "lion.activate.complete",
				timestamp: Date.now(),
				runId,
				strategy: runtime.state.strategy,
				phase: runtime.state.phase,
				planSlug: reviewPlan.slug,
				planPath: reviewPlan.rootPath,
			});
			const content = [
				"Lion code review strategy active.",
				"",
				todo.summary,
				"",
				`Durable review plan created: ${reviewPlan.rootPath}`,
				"Use review planning to map environment, skills, flows, risks, and expected behavior before reporting bugs.",
				"During review execution, merge findings by severity, dedupe repeated root causes, and validate false positives separately.",
				"",
				'Next step: use lion_checklist_start_next with kind "review" and this review path.',
				reviewPlan.rootPath,
			].join("\n");

			const message = {
				customType: "lion-orchestrator-feedback",
				content,
				display: false,
				details: {
					runId,
					phase: runtime.state.phase,
					strategy: runtime.state.strategy,
					planSlug: reviewPlan.slug,
					planPath: reviewPlan.rootPath,
					nextTools: [],
					nextToolsRequired: ["lion_checklist_start_next"],
					reviewTodo: todo,
					reviewPlan,
				},
			};

			if (ctx.isIdle()) {
				pi.sendMessage(message, { triggerTurn: true });
			} else {
				pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
			}

			runtime.ui.showMessage(`Lion code review strategy active.\n\n${reviewPlan.rootPath}`);
		},
	});

	pi.registerCommand("lion-review", {
		description: "Create a durable code review plan for the active Lion plan implementation",
		handler: async (args, ctx) => {
			const activePlanPath = runtime.state.activePlanPath;
			if (!activePlanPath || runtime.state.strategy !== "plan") {
				runtime.ui.showMessage("Lion review requires an active Lion plan. Run /lion-activate <plan> first.");
				return;
			}

			const runId = createRunId();
			const focus = args.trim();
			const cwd = ctx.cwd ?? ctx.sessionManager.getCwd();
			const plan = loadLionPlan(activePlanPath);
			runtime.logState("command_lion_review", { runId, focus, cwd, planPath: plan.rootPath });

			const git = await collectCodeReviewGitContext(cwd);
			const todo = buildPlanCodeReviewTodo({ plan, focus, git });
			const reviewPlan = createReviewPlanFromTodo(cwd, { slug: `review-${plan.slug}`, todo });
			runtime.activateReview({
				kind: "structured",
				slug: reviewPlan.slug,
				rootPath: reviewPlan.rootPath,
				contextFile: reviewPlan.contextFile,
				indexFile: reviewPlan.indexFile,
				checklistFile: reviewPlan.checklistFile,
				tasks: reviewPlan.tasks,
			});
			runtime.persist();
			runtime.ensureController(ctx);
			runtime.attachMainSession(ctx);
			runtime.ui.updateStatus(ctx, runtime.state);
			runtime.emit({
				type: "lion.activate.complete",
				timestamp: Date.now(),
				runId,
				strategy: runtime.state.strategy,
				phase: runtime.state.phase,
				planSlug: reviewPlan.slug,
				planPath: reviewPlan.rootPath,
			});

			const content = [
				"Lion plan review pipeline created.",
				`Source plan: ${plan.slug}`,
				`Source plan path: ${plan.rootPath}`,
				focus ? `Focus: ${focus}` : "",
				"",
				todo.summary,
				"",
				`Durable review plan created: ${reviewPlan.rootPath}`,
				"This review is based on the active Lion plan and implementation evidence from git.",
				"Execute it as a read-only review pipeline: start the next review checklist task, run the returned lionTasksParams with lion_tasks, then record evidence.",
				"",
				'Next step: use lion_checklist_start_next with kind "review" and this review path.',
				reviewPlan.rootPath,
			]
				.filter((line) => line !== "")
				.join("\n");

			const message = {
				customType: "lion-orchestrator-feedback",
				content,
				display: false,
				details: {
					runId,
					phase: runtime.state.phase,
					strategy: runtime.state.strategy,
					sourcePlanSlug: plan.slug,
					sourcePlanPath: plan.rootPath,
					planSlug: reviewPlan.slug,
					planPath: reviewPlan.rootPath,
					nextTools: ["lion_checklist_start_next", "lion_tasks"],
					nextToolsRequired: ["lion_checklist_start_next"],
					reviewTodo: todo,
					reviewPlan,
				},
			};

			if (ctx.isIdle()) {
				pi.sendMessage(message, { triggerTurn: true });
			} else {
				pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
			}

			runtime.ui.showMessage(`Lion plan review pipeline created.\n\n${reviewPlan.rootPath}`);
		},
	});

	pi.registerCommand("lion-validate", {
		description: "Ask the orchestrator to validate the active Lion plan through lion_tasks",
		handler: async (args, ctx) => {
			const activePlanPath = runtime.state.activePlanPath;
			if (!activePlanPath) {
				runtime.ui.showMessage(
					"Lion validate requires an active plan or review. Run /lion-activate or /lion-code-review first.",
				);
				return;
			}
			if (runtime.state.phase !== "planning") {
				runtime.ui.showMessage("Lion validate can only run in planning mode.");
				return;
			}

			const focus = args.trim() || undefined;
			runtime.logState("command_lion_validate", { focus });
			if (runtime.state.strategy === "review") {
				const review = loadReviewPlan(activePlanPath, ctx.cwd ?? ctx.sessionManager.getCwd());
				const content = [
					"Lion review validation requested.",
					`Review: ${review.slug}`,
					`Path: ${review.rootPath}`,
					focus ? `Focus: ${focus}` : "",
					"",
					"Use lion_tasks with validator delegations to validate reported findings and reject false positives.",
					"Do not edit files. Do not switch to implementation.",
					"Return verified findings, rejected false positives, inferred risks, unknowns, and action plan.",
					"",
					"Suggested delegation prompt:",
					buildReviewValidationPrompt(review, focus),
				]
					.filter((line) => line !== "")
					.join("\n");

				const message = {
					customType: "lion-orchestrator-feedback",
					content,
					display: false,
					details: {
						planSlug: review.slug,
						planPath: review.rootPath,
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

				runtime.ui.showMessage(
					`Lion review validation requested for ${review.slug}. Delegating through lion_tasks.`,
				);
				return;
			}

			const plan = loadLionPlan(activePlanPath);

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

			const activePlanPath = runtime.state.activePlanPath;
			const strategy = runtime.state.strategy;

			const guardResult = matchStrategyOnly(strategy, {
				plan: () => {
					if (!activePlanPath) {
						return { error: "Lion build requires an active plan. Run /lion-activate <plan> first." };
					}
					return null;
				},
				review: () => {
					if (!activePlanPath) {
						return { error: "Lion review build requires an active review. Run /lion-code-review first." };
					}
					return null;
				},
				simple: () => null,
				none: () => null,
			});
			if (guardResult) {
				runtime.ui.showMessage(guardResult.error);
				return;
			}

			await ctx.waitForIdle();
			const runId = createRunId();
			runtime.logState("command_lion_build", { runId, planPath: activePlanPath, strategy });
			runtime.setPhase("building");
			runtime.persist();
			runtime.ui.updateStatus(ctx, runtime.state);

			const content = matchStrategyOnly(strategy, {
				plan: () =>
					[
						"Lion build mode activated.",
						`Plan: ${runtime.state.activePlanSlug || activePlanPath}`,
						"The orchestrator is now in control of task execution.",
						'Immediately use lion_tasks with source: "active_plan_next_task" to select, execute, and record the next task.',
						"Do not implement application code directly in the main thread.",
					].join("\n"),
				review: () =>
					[
						"Lion review execution mode activated.",
						`Review: ${runtime.state.activePlanSlug || activePlanPath}`,
						"The orchestrator is now in control of read-only review checklist execution.",
						'Immediately use lion_checklist_start_next with kind "review", then run the returned lionTasksParams with lion_tasks.',
						"Do not edit application code. Use validators to reject false positives before final reporting.",
					].join("\n"),
				simple: () =>
					[
						"Lion execution mode activated.",
						"Simple orchestration is active. No durable plan is required.",
						"Delegate work with lion_tasks and synthesize results in the main thread.",
						"Do not implement application code directly unless it is trivial.",
					].join("\n"),
				none: () =>
					[
						"Lion execution mode activated.",
						"Simple orchestration is active. No durable plan is required.",
						"Delegate work with lion_tasks and synthesize results in the main thread.",
						"Do not implement application code directly unless it is trivial.",
					].join("\n"),
			});

			const nextTools = strategy === "review" ? ["lion_checklist_start_next", "lion_tasks"] : ["lion_tasks"];

			const message = {
				customType: "lion-orchestrator-feedback",
				content,
				display: false,
				details: {
					runId,
					planSlug: runtime.state.activePlanSlug,
					planPath: activePlanPath,
					strategy,
					phase: "building",
					nextTools,
					nextToolsRequired: strategy === "review" ? ["lion_checklist_start_next"] : undefined,
				},
			};

			if (strategy === "plan") {
				pi.sendMessage(message, { triggerTurn: false });
			} else if (ctx.isIdle()) {
				pi.sendMessage(message, { triggerTurn: true });
			} else {
				pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
			}

			const displayMessage = matchStrategyOnly(strategy, {
				plan: () => `Lion build mode activated for ${runtime.state.activePlanSlug || activePlanPath}.`,
				review: () => `Lion review execution mode activated for ${runtime.state.activePlanSlug || activePlanPath}.`,
				simple: () => "Lion execution mode activated. Delegate with lion_tasks.",
				none: () => "Lion execution mode activated. Delegate with lion_tasks.",
			});
			runtime.ui.showMessage(displayMessage);

			if (strategy === "plan") {
				const runner = new TaskRunner(runtime);
				await runner.runActivePlanBuild(ctx, {
					threadId: runtime.mainSession.getThread()?.instanceId ?? `main:${ctx.sessionManager.getSessionId()}`,
					toolCallId: `lion-build-${runId}`,
				});
			}
		},
	});

	pi.registerCommand("lion-dashboard", {
		description: "Open the Lion subagent dashboard in browser",
		handler: async (_args, ctx) => {
			try {
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

function buildReviewValidationPrompt(review: ReturnType<typeof loadReviewPlan>, focus?: string): string {
	return [
		'<delegation kind="code-review-validation">',
		"  <role>validator</role>",
		`  <review path="${escapeXml(review.rootPath)}" checklist="${escapeXml(review.checklistFile)}" />`,
		focus ? `  <focus>${escapeXml(focus)}</focus>` : "",
		"  <objective>Validate review findings and reject false positives before final reporting.</objective>",
		"  <scope>",
		...review.tasks.map(
			(task) =>
				`    <task id="${escapeXml(task.id)}" file="${escapeXml(task.file)}" status="${escapeXml(task.status)}" />`,
		),
		"  </scope>",
		"  <constraints>",
		"    <must>Read the review context, checklist, task summaries, and relevant source evidence.</must>",
		"    <must>Check callers, guards, tests, config, schemas, or intended behavior that could explain away each suspected bug.</must>",
		"    <must>Classify each item as verified, rejected false positive, inferred risk, or unknown.</must>",
		"    <must_not>Edit files.</must_not>",
		"    <must_not>Claim a finding is verified without concrete evidence.</must_not>",
		"  </constraints>",
		"  <output>",
		"    <must_return>Verified findings, rejected false positives, inferred risks, unknowns, evidence checked, and action plan.</must_return>",
		"  </output>",
		"</delegation>",
	]
		.filter((line) => line !== "")
		.join("\n");
}

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}
