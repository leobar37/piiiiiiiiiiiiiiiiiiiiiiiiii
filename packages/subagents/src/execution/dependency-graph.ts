import type { SubAgentInstance } from "../instance.js";
import type { DelegationResult, DelegationTask, SubAgentEvent } from "../types.js";

export async function executeDependencyGraph(
	instances: SubAgentInstance[],
	taskMap: Map<string, DelegationTask>,
	_onEvent?: (event: SubAgentEvent) => void,
): Promise<DelegationResult[]> {
	const results = new Map<string, DelegationResult>();
	const _instanceMap = new Map(instances.map((inst) => [inst.taskId, inst]));
	const completed = new Set<string>();
	const failed = new Set<string>();

	// Detect cycles
	function hasCycle(taskId: string, visited: Set<string> = new Set(), stack: Set<string> = new Set()): boolean {
		if (stack.has(taskId)) return true;
		if (visited.has(taskId)) return false;
		visited.add(taskId);
		stack.add(taskId);
		const task = taskMap.get(taskId);
		if (task?.dependsOn) {
			for (const dep of task.dependsOn) {
				if (hasCycle(dep, visited, stack)) return true;
			}
		}
		stack.delete(taskId);
		return false;
	}

	for (const taskId of taskMap.keys()) {
		if (hasCycle(taskId)) {
			throw new Error(`Cycle detected in dependency graph involving task "${taskId}"`);
		}
	}

	// Execute by levels
	while (completed.size + failed.size < instances.length) {
		const level: SubAgentInstance[] = [];

		for (const instance of instances) {
			if (completed.has(instance.taskId) || failed.has(instance.taskId)) continue;

			const task = taskMap.get(instance.taskId);
			const depsSatisfied = !task?.dependsOn || task.dependsOn.every((dep) => completed.has(dep));

			if (depsSatisfied) {
				level.push(instance);
			}
		}

		if (level.length === 0) {
			// Remaining tasks are blocked
			for (const instance of instances) {
				if (completed.has(instance.taskId) || failed.has(instance.taskId)) continue;
				const result: DelegationResult = {
					taskId: instance.taskId,
					agent: instance.definitionName,
					status: "blocked",
					outputPath: "",
					summary: "Blocked: dependencies failed or not found",
					duration: 0,
					turnCount: 0,
					finalState: instance.getState(),
				};
				results.set(instance.taskId, result);
				failed.add(instance.taskId);
			}
			break;
		}

		const settled = await Promise.allSettled(level.map((instance) => instance.start()));

		for (const [i, result] of settled.entries()) {
			const instance = level[i];
			if (result.status === "fulfilled") {
				results.set(instance.taskId, result.value);
				completed.add(instance.taskId);
			} else {
				const failedResult: DelegationResult = {
					taskId: instance.taskId,
					agent: instance.definitionName,
					status: "failed",
					outputPath: "",
					summary: result.reason instanceof Error ? result.reason.message : String(result.reason),
					duration: 0,
					turnCount: 0,
					finalState: instance.getState(),
				};
				results.set(instance.taskId, failedResult);
				failed.add(instance.taskId);
			}
		}
	}

	// Return in task definition order
	return instances.map((inst) => results.get(inst.taskId)!);
}
