import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ExecutionPlan } from "@local/pi-subagents";
import { Type } from "typebox";
import { getSubagentController } from "./controller.js";
import { definitionSummary, runtimeStatus, toToolResult } from "./format.js";
import { PromptParams, RunParams, RunPlanParams, StatusParams, TaskIdParams } from "./schemas.js";
import { createTaskId, rememberTask, toDelegationTask, toPlanDelegationTask, toPlanResult } from "./tasks.js";
import type { SubagentsRuntime } from "./types.js";

export function registerSubagentsTools(pi: ExtensionAPI, runtime: SubagentsRuntime): void {
	pi.registerTool({
		name: "subagent_list",
		label: "Sub-agent List",
		description: "List the sub-agent definitions available in this Pi build.",
		promptSnippet: "List available local sub-agent definitions before delegating when the right role is unclear",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const controller = await getSubagentController(runtime, ctx);
			return toToolResult({
				definitions: controller.getDefinitions().map(definitionSummary),
			});
		},
	});

	pi.registerTool({
		name: "subagent_run",
		label: "Sub-agent Run",
		description:
			"Run one local sub-agent using @local/pi-subagents. Use wait=false when the task should continue in the background.",
		promptSnippet: "Delegate a focused task to a local sub-agent and inspect its result",
		parameters: RunParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const controller = await getSubagentController(runtime, ctx);
			const task = toDelegationTask(params);
			const running = rememberTask(runtime, task.id, controller.executeTask(task));
			if (params.wait === false) {
				return toToolResult({ taskId: task.id, status: "running" });
			}
			const result = await running.promise;
			return toToolResult({ taskId: task.id, result });
		},
	});

	pi.registerTool({
		name: "subagent_run_plan",
		label: "Sub-agent Run Plan",
		description: "Run multiple local sub-agents sequentially, in parallel, or by dependency graph.",
		promptSnippet: "Delegate a multi-step plan to local sub-agents with explicit execution strategy",
		parameters: RunPlanParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const controller = await getSubagentController(runtime, ctx);
			const taskId = createTaskId("plan");
			const plan: ExecutionPlan = {
				strategy: params.strategy,
				tasks: params.tasks.map(toPlanDelegationTask),
			};
			const running = rememberTask(
				runtime,
				taskId,
				controller.executePlan(plan).then((results) => toPlanResult(taskId, results)),
			);
			if (params.wait === false) {
				return toToolResult({ taskId, status: "running" });
			}
			const result = await running.promise;
			return toToolResult({ taskId, result });
		},
	});

	pi.registerTool({
		name: "subagent_status",
		label: "Sub-agent Status",
		description: "Inspect running and completed local sub-agent tasks.",
		promptSnippet: "Inspect retained local sub-agent tasks and recent lifecycle events",
		parameters: StatusParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			await getSubagentController(runtime, ctx);
			return toToolResult(runtimeStatus(runtime, params.id));
		},
	});

	pi.registerTool({
		name: "subagent_prompt",
		label: "Sub-agent Prompt",
		description: "Send a prompt, follow-up, or steering message to a retained local sub-agent.",
		promptSnippet: "Prompt a retained local sub-agent again before deciding the next orchestration step",
		parameters: PromptParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const controller = await getSubagentController(runtime, ctx);
			if (params.mode === "follow_up") {
				await controller.instanceFollowUp(params.id, params.message);
			} else if (params.mode === "steer") {
				await controller.steerInstance(params.id, params.message);
			} else {
				await controller.promptInstance(params.id, params.message);
			}
			return toToolResult({ taskId: params.id, status: "sent", mode: params.mode ?? "prompt" });
		},
	});

	pi.registerTool({
		name: "subagent_cancel",
		label: "Sub-agent Cancel",
		description: "Cancel a retained local sub-agent task.",
		promptSnippet: "Cancel a retained local sub-agent when it is stuck or no longer useful",
		parameters: TaskIdParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const controller = await getSubagentController(runtime, ctx);
			await controller.cancelInstance(params.id);
			return toToolResult({ taskId: params.id, status: "cancelled" });
		},
	});

	pi.registerTool({
		name: "subagent_summarize",
		label: "Sub-agent Summarize",
		description: "Summarize a retained local sub-agent conversation.",
		promptSnippet: "Summarize a retained local sub-agent conversation before releasing or continuing it",
		parameters: TaskIdParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const controller = await getSubagentController(runtime, ctx);
			const summary = await controller.summarizeInstance(params.id, {
				maxMessages: 30,
				maxTurns: 10,
				includeTools: true,
			});
			return toToolResult({ taskId: params.id, summary });
		},
	});
}
