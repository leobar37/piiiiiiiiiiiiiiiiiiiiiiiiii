import { Type } from "typebox";
import type { LionRun } from "./core.js";
import { PlanActivator } from "./plan-activator.js";
import type { LionRuntime } from "./runtime.js";
import { TaskReconciler } from "./task-reconciler.js";
import { TaskRunner } from "./task-runner.js";
import type { LionBuildResult, LionPlan, LionPlanValidationResult, LionTaskResult } from "./types.js";

// =============================================================================
// Shared types
// =============================================================================

export interface LionToolResponse {
	run: LionRun | null;
	result?: LionBuildResult;
	validation?: LionPlanValidationResult;
	plan?: LionPlan;
	tasks?: LionTaskResult[];
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
	tasks: Type.Array(
		Type.Object({
			definition: Type.String({
				description: "Subagent definition to use (e.g., 'analyzer', 'executor', 'reviewer')",
			}),
			title: Type.String({ description: "Short title identifying this task" }),
			prompt: Type.String({ description: "Full prompt/instructions for the subagent" }),
			capabilities: Type.Optional(
				Type.Object({
					canEdit: Type.Optional(Type.Boolean()),
					canWrite: Type.Optional(Type.Boolean()),
					canExecute: Type.Optional(Type.Boolean()),
					canResearch: Type.Optional(Type.Boolean()),
				}),
			),
		}),
		{ description: "Array of tasks to execute. Must provide at least one task." },
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

const RetryTaskParams = Type.Object({
	task_id: Type.String({ description: "Task ID to retry/reset in the active plan." }),
	reset_dependencies: Type.Optional(
		Type.Boolean({ description: "If true, also reset dependent tasks to pending. Default: false." }),
	),
});

// =============================================================================
// Tool registration
// =============================================================================

export function registerLionTools(runtime: LionRuntime): void {
	const activator = new PlanActivator(runtime);
	const reconciler = new TaskReconciler(runtime);
	const runner = new TaskRunner(runtime);

	runtime.pi.registerTool({
		name: "lion_activate_plan",
		label: "Lion Activate Plan",
		description:
			"Resolve a user plan reference, activate the matching Lion plan, or return candidate plans when the reference is ambiguous.",
		promptSnippet: "Resolve the user's plan reference and activate the correct Lion plan before starting work",
		parameters: ActivatePlanParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return toToolResult(activator.activate(ctx, params.reference));
		},
	});

	runtime.pi.registerTool({
		name: "lion_reconcile_plan",
		label: "Lion Reconcile Plan",
		description: "Reset a failed or blocked task to retryable/pending status.",
		promptSnippet: "Reset a failed or blocked task for retry",
		parameters: RetryTaskParams,
		async execute(_toolCallId, params) {
			return toToolResult(reconciler.reconcile(params.task_id, params.reset_dependencies ?? false));
		},
	});

	runtime.pi.registerTool({
		name: "lion_tasks",
		label: "Lion Tasks",
		description:
			"Delegate one or more tasks to subagents with configurable execution strategy (parallel, sequential, or chain).",
		promptSnippet: "Delegate tasks to subagents with explicit task definitions",
		parameters: LionTasksParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return toToolResult(await runner.run(ctx, params));
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
