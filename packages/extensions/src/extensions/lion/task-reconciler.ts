import { loadLionPlan, updateStructuredTaskStatus } from "./plans/index.js";
import type { LionRuntime } from "./runtime.js";
import type { LionToolResponse } from "./tools.js";

export class TaskReconciler {
	runtime: LionRuntime;

	constructor(runtime: LionRuntime) {
		this.runtime = runtime;
	}

	reconcile(taskId: string, resetDependencies: boolean): LionToolResponse {
		const activePlanPath = this.runtime.state.activePlanPath;
		if (!activePlanPath) throw new Error("No active plan. Run lion_activate_plan first.");

		const plan = loadLionPlan(activePlanPath);
		const task = plan.tasks.find((t) => t.id === taskId);
		if (!task) throw new Error(`Task ${taskId} not found in plan ${plan.slug}`);

		if (task.status !== "blocked" && task.status !== "retryable") {
			throw new Error(`Task ${taskId} is ${task.status}. Only blocked or retryable tasks can be retried.`);
		}

		updateStructuredTaskStatus(plan, taskId, "retryable");

		if (resetDependencies) {
			for (const t of plan.tasks) {
				if (t.dependencies.includes(taskId) && t.status === "blocked") {
					updateStructuredTaskStatus(plan, t.id, "pending");
				}
			}
		}

		return {
			run: this.runtime.core.activeRun,
			plan,
		};
	}
}
