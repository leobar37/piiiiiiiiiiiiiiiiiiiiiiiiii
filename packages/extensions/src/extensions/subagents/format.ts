import type { SubAgentDefinition } from "@local/pi-subagents";
import type { RunningSubagentTask, SubagentsRuntime } from "./types.js";

export function toToolResult(details: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
		details,
	};
}

export function definitionSummary(definition: SubAgentDefinition) {
	return {
		name: definition.name,
		description: definition.description,
		capabilities: definition.capabilities,
		tools: definition.tools,
		disabledTools: definition.disabledTools,
		thinkingLevel: definition.thinkingLevel,
		allowQuery: definition.allowQuery,
	};
}

export function taskSummary(task: RunningSubagentTask) {
	return {
		id: task.id,
		status: task.result?.status ?? (task.error ? "failed" : "running"),
		startedAt: task.startedAt,
		result: task.result,
		error: task.error,
	};
}

export function runtimeStatus(runtime: SubagentsRuntime, taskId?: string) {
	const task = taskId ? runtime.tasks.get(taskId) : undefined;
	return {
		tasks: task ? [taskSummary(task)] : Array.from(runtime.tasks.values()).map(taskSummary),
		recentEvents: runtime.events.slice(-30),
	};
}
