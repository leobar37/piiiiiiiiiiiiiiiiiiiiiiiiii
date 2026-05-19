import type { SubAgentInstance } from "../instance.js";
import type { DelegationResult, SubAgentEvent } from "../types.js";

export async function executeParallel(
	instances: SubAgentInstance[],
	_onEvent?: (event: SubAgentEvent) => void,
): Promise<DelegationResult[]> {
	const settled = await Promise.allSettled(
		instances.map(async (instance) => {
			return instance.start();
		}),
	);

	const results: DelegationResult[] = [];

	for (const [i, result] of settled.entries()) {
		if (result.status === "fulfilled") {
			results.push(result.value);
		} else {
			// Create a failed result
			const task = instances[i];
			results.push({
				taskId: task.taskId,
				agent: task.definitionName,
				status: "failed",
				summary: result.reason instanceof Error ? result.reason.message : String(result.reason),
				duration: 0,
				turnCount: 0,
				finalState: task.getState(),
			});
		}
	}

	return results;
}
