import { Type } from "typebox";
import type { LionRun } from "./core.js";
import { PlanActivator } from "./plan-activator.js";
import type { LionRuntime } from "./runtime.js";
import { TaskRunner } from "./task-runner.js";
import type { LionBuildResult, LionPlan, LionTask, LionTaskResult } from "./types.js";

// =============================================================================
// Shared types
// =============================================================================

export interface LionToolResponse {
	run: LionRun | null;
	result?: LionBuildResult;
	plan?: LionPlan;
	tasks?: LionTaskResult[];
	nextTask?: LionTask | null;
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

// =============================================================================
// Tool registration
// =============================================================================

export function registerLionTools(runtime: LionRuntime): void {
	const activator = new PlanActivator(runtime);
	const runner = new TaskRunner(runtime);

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
