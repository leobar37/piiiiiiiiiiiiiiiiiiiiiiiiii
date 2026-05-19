import type { SubAgentInstance } from "../instance.js";
import type { DelegationResult, SubAgentEvent } from "../types.js";

export async function executeSequential(
	instances: SubAgentInstance[],
	_onEvent?: (event: SubAgentEvent) => void,
): Promise<DelegationResult[]> {
	const results: DelegationResult[] = [];

	for (const instance of instances) {
		const result = await instance.start();
		results.push(result);
	}

	return results;
}
