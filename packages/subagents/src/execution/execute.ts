import type { SubAgentInstance } from "../instance.js";
import type { DelegationResult, ExecutionPlan, SubAgentEvent } from "../types.js";
import { executeChain } from "./chain.js";
import { executeParallel } from "./parallel.js";
import { executeSequential } from "./sequential.js";

export async function execute(
	plan: ExecutionPlan,
	instances: SubAgentInstance[],
	onEvent?: (event: SubAgentEvent) => void,
): Promise<DelegationResult[]> {
	switch (plan.strategy) {
		case "sequential":
			return executeSequential(instances, onEvent);
		case "parallel":
			return executeParallel(instances, onEvent);
		case "chain":
			return executeChain(instances, plan.tasks, plan.chainOptions, onEvent);
		default:
			throw new Error(`Unknown execution strategy: ${(plan as { strategy: string }).strategy}`);
	}
}
