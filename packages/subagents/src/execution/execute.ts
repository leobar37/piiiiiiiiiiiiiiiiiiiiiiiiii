import type { SubAgentInstance } from "../instance.js";
import type { DelegationResult, ExecutionPlan, SubAgentEvent } from "../types.js";
import { executeDependencyGraph } from "./dependency-graph.js";
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
		case "dependency-graph": {
			const taskMap = new Map(plan.tasks.map((t) => [t.id, t]));
			return executeDependencyGraph(instances, taskMap, onEvent);
		}
		default:
			throw new Error(`Unknown execution strategy: ${(plan as { strategy: string }).strategy}`);
	}
}
