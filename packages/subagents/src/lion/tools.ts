import { Type } from "typebox";
import { LionChecklistService } from "./checklist-service.js";
import type { LionRun } from "./core.js";
import { LionEvents } from "./events/defs.js";
import { PlanActivator } from "./plan-activator.js";
import { buildReviewTaskLionTasksParams, loadReviewPlan } from "./review-plan.js";
import type { LionRuntime } from "./runtime.js";
import type { RunTasksParams } from "./task-runner.js";
import { TaskRunner } from "./task-runner.js";
import type {
	LionBuildResult,
	LionChecklistKind,
	LionChecklistSnapshot,
	LionPlan,
	LionTask,
	LionTaskResult,
	LionTaskStatus,
} from "./types.js";

// =============================================================================
// Shared types
// =============================================================================

export interface LionToolResponse {
	run: LionRun | null;
	result?: LionBuildResult;
	plan?: LionPlan;
	tasks?: LionTaskResult[];
	nextTask?: LionTask | null;
	checklist?: LionChecklistSnapshot;
	checklistTask?: LionTask | null;
	lionTasksParams?: RunTasksParams;
	candidates?: Array<{
		slug: string;
		path: string;
		displayPath: string;
		kind: string;
		reason: string;
	}>;
}

// =============================================================================
// Parameter schemas
// =============================================================================

const LionTasksParams = Type.Object({
	source: Type.Optional(
		Type.Literal("active_plan_next_task", {
			description: "Select and run the next executable task from the active durable plan.",
		}),
	),
	role: Type.Optional(
		Type.Literal("executor", {
			description:
				"Role to use when source is active_plan_next_task. Only executor is allowed for active_plan_next_task; use explicit tasks array for other roles.",
		}),
	),
	tasks: Type.Optional(
		Type.Array(
			Type.Object({
				definition: Type.String({
					description: "Subagent definition to use (e.g., 'analyzer', 'executor', 'reviewer')",
				}),
				title: Type.String({ description: "Short title identifying this task" }),
				prompt: Type.String({
					description:
						"Compact XML delegation brief for the subagent. Include role, plan path, task id, task file path, scope, objective, constraints, output contract, and validation. Prefer references to files over pasted plan content or long command lists.",
				}),
				capabilities: Type.Optional(
					Type.Object({
						canEdit: Type.Optional(Type.Boolean()),
						canWrite: Type.Optional(Type.Boolean()),
						canExecute: Type.Optional(Type.Boolean()),
						canResearch: Type.Optional(Type.Boolean()),
					}),
				),
				tools: Type.Optional(
					Type.Array(Type.String(), {
						description: "Optional tool allowlist for this subagent task.",
					}),
				),
				disabledTools: Type.Optional(
					Type.Array(Type.String(), {
						description: "Optional tools to disable for this subagent task.",
					}),
				),
				skillPaths: Type.Optional(
					Type.Array(Type.String(), {
						description:
							"Optional skill file or directory paths to force-load for this subagent. Use when a task needs a specific domain workflow skill.",
					}),
				),
			}),
			{ description: "Array of tasks to execute. Must provide at least one task." },
		),
	),
	strategy: Type.Optional(
		Type.Union(
			[
				Type.Literal("parallel", { description: "Execute all tasks concurrently" }),
				Type.Literal("sequential", { description: "Execute tasks one after another" }),
				Type.Literal("chain", { description: "Execute sequentially, passing output to next task" }),
			],
			{ description: "Execution strategy. Default: sequential" },
		),
	),
	concurrency: Type.Optional(
		Type.Number({ description: "Max concurrent tasks for parallel strategy. Default: 3", minimum: 1, maximum: 10 }),
	),
	chainOptions: Type.Optional(
		Type.Object({
			passOutputToNext: Type.Optional(
				Type.Boolean({ description: "Pass previous output to next task. Default: true" }),
			),
			outputMode: Type.Optional(
				Type.Union([Type.Literal("append"), Type.Literal("replace"), Type.Literal("template")]),
			),
			template: Type.Optional(Type.String()),
			stopOnFailure: Type.Optional(Type.Boolean({ description: "Stop chain on failure. Default: true" })),
		}),
	),
});

const ActivatePlanParams = Type.Object({
	reference: Type.String({
		description: "Natural-language plan reference, slug, relative path, or absolute path.",
	}),
});

const ChecklistKind = Type.Union([Type.Literal("plan"), Type.Literal("review")]);

const ChecklistReadParams = Type.Object({
	kind: ChecklistKind,
	reference: Type.Optional(
		Type.String({
			description: "Plan or review path/slug. Optional for kind=plan when a plan is active.",
		}),
	),
});

const ChecklistStartNextParams = ChecklistReadParams;

const ChecklistRecordParams = Type.Object({
	kind: ChecklistKind,
	reference: Type.Optional(
		Type.String({
			description: "Plan or review path/slug. Optional for kind=plan when a plan is active.",
		}),
	),
	taskId: Type.String({ description: "Checklist task id to record." }),
	status: Type.Union([
		Type.Literal("pending"),
		Type.Literal("in_progress"),
		Type.Literal("complete"),
		Type.Literal("blocked"),
		Type.Literal("retryable"),
	]),
	summary: Type.Optional(Type.String({ description: "Short evidence-backed task summary." })),
});

// =============================================================================
// Tool registration
// =============================================================================

export function registerLionTools(runtime: LionRuntime): void {
	const activator = new PlanActivator(runtime);
	const runner = new TaskRunner(runtime);
	const checklistService = new LionChecklistService();

	runtime.pi.registerTool({
		name: "lion_activate_plan",
		label: "Lion Activate Plan",
		description:
			"Resolve and activate a Lion plan reference. This only selects the active plan and keeps Lion in planning mode; it does not authorize build or execution.",
		promptSnippet:
			"Activate the requested Lion plan when the user asks to select or switch plans. After activation, use lion_tasks with analyzer or planner delegations for analysis and validation. This does not permit implementation; /lion-build is still required.",
		parameters: ActivatePlanParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const result = activator.activate(ctx, params.reference);
			runtime.logTool("lion_activate_plan", { reference: params.reference }, result);
			return toToolResult(result);
		},
	});

	runtime.pi.registerTool({
		name: "lion_checklist_read",
		label: "Lion Checklist Read",
		description: "Read the durable Lion checklist snapshot for an active plan or review plan.",
		promptSnippet:
			"Use lion_checklist_read to inspect durable checklist progress. Do not read or edit checklist.json directly.",
		parameters: ChecklistReadParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const checklist = checklistService.read({
				kind: params.kind as LionChecklistKind,
				reference: params.reference,
				activePlanPath: runtime.state.activePlanPath,
				cwd: ctx.cwd ?? ctx.sessionManager.getCwd(),
			});
			const runId = runtime.state.lastRunId ?? `checklist-${Date.now()}`;
			runtime.emit(
				LionEvents.checklistSnapshot({
					runId,
					kind: checklist.kind,
					slug: checklist.slug,
					rootPath: checklist.rootPath,
					checklist,
				}),
			);
			const result: LionToolResponse = { run: runtime.core.activeRun, checklist };
			runtime.logTool("lion_checklist_read", params, result);
			return toToolResult(result);
		},
	});

	runtime.pi.registerTool({
		name: "lion_checklist_start_next",
		label: "Lion Checklist Start Next",
		description: "Mark the next durable checklist task in progress and return the updated snapshot.",
		promptSnippet:
			"Use lion_checklist_start_next before preparing work from a durable plan or review checklist. Do not update checklist.json manually.",
		parameters: ChecklistStartNextParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { checklist, task } = checklistService.startNext({
				kind: params.kind as LionChecklistKind,
				reference: params.reference,
				activePlanPath: runtime.state.activePlanPath,
				cwd: ctx.cwd ?? ctx.sessionManager.getCwd(),
			});
			const reviewPlan =
				checklist.kind === "review" && task
					? loadReviewPlan(params.reference ?? checklist.rootPath, ctx.cwd ?? ctx.sessionManager.getCwd())
					: null;
			const reviewTask = reviewPlan?.tasks.find((item) => item.id === task?.id);
			const lionTasksParams =
				reviewPlan && reviewTask ? buildReviewTaskLionTasksParams(reviewPlan, reviewTask) : undefined;
			if (checklist.kind === "plan" || checklist.kind === "review") runtime.setActiveTask(task?.id ?? null);
			const runId = runtime.state.lastRunId ?? `checklist-${Date.now()}`;
			runtime.emit(
				task
					? LionEvents.checklistTaskStarted({
							runId,
							kind: checklist.kind,
							slug: checklist.slug,
							rootPath: checklist.rootPath,
							checklist,
							taskId: task.id,
						})
					: LionEvents.checklistUpdated({
							runId,
							kind: checklist.kind,
							slug: checklist.slug,
							rootPath: checklist.rootPath,
							checklist,
						}),
			);
			const result: LionToolResponse = {
				run: runtime.core.activeRun,
				checklist,
				checklistTask: task,
				lionTasksParams,
			};
			runtime.logTool("lion_checklist_start_next", params, result);
			return toToolResult(result);
		},
	});

	runtime.pi.registerTool({
		name: "lion_checklist_record",
		label: "Lion Checklist Record",
		description: "Record a durable checklist task result for an active plan or review plan.",
		promptSnippet:
			"Use lion_checklist_record to mark durable checklist tasks complete, blocked, retryable, pending, or in progress. Include evidence in summary.",
		parameters: ChecklistRecordParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { checklist, task } = checklistService.recordResult({
				kind: params.kind as LionChecklistKind,
				reference: params.reference,
				activePlanPath: runtime.state.activePlanPath,
				cwd: ctx.cwd ?? ctx.sessionManager.getCwd(),
				taskId: params.taskId,
				status: params.status as LionTaskStatus,
				summary: params.summary,
			});
			if (
				(checklist.kind === "plan" || checklist.kind === "review") &&
				runtime.state.activeTaskId === params.taskId
			) {
				runtime.setActiveTask(null);
			}
			const runId = runtime.state.lastRunId ?? `checklist-${Date.now()}`;
			runtime.emit(
				LionEvents.checklistTaskRecorded({
					runId,
					kind: checklist.kind,
					slug: checklist.slug,
					rootPath: checklist.rootPath,
					checklist,
					taskId: params.taskId,
					status: params.status as LionTaskStatus,
					summary: params.summary,
				}),
			);
			const result: LionToolResponse = { run: runtime.core.activeRun, checklist, checklistTask: task };
			runtime.logTool("lion_checklist_record", params, result);
			return toToolResult(result);
		},
	});

	runtime.pi.registerTool({
		name: "lion_tasks",
		label: "Lion Tasks",
		description:
			"Phase-aware Lion subagent orchestration. In planning it may run analyzer/planner delegations only; in build it may execute active plan tasks or explicit executor/reviewer delegations.",
		promptSnippet:
			"Delegate subagent work via lion_tasks. Use explicit tasks array with definition (analyzer, planner, reviewer, validator, executor), title, and XML prompt. Use source: active_plan_next_task (executor only) during build mode to run the next plan task. Strategies: parallel, sequential, chain. Do not pass both source and tasks.",
		parameters: LionTasksParams,
		async execute(toolCallId, params, _signal, _onUpdate, ctx) {
			const result = await runner.run(ctx, params, {
				threadId: runtime.mainSession.getThread()?.instanceId ?? `main:${ctx.sessionManager.getSessionId()}`,
				toolCallId,
			});
			runtime.logTool(
				"lion_tasks",
				{
					source: params.source,
					role: params.role,
					strategy: params.strategy,
					taskCount: params.tasks?.length ?? 0,
				},
				result,
			);
			return toToolResult(result);
		},
	});
}

// =============================================================================
// Utilities
// =============================================================================

function toToolResult(response: LionToolResponse) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
		details: response,
	};
}
