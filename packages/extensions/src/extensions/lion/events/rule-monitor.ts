import type { LionEvent } from "../types.js";

export class LionRuleMonitor {
	private approvedTasks = new Set<string>();

	constructor(private readonly emit: (event: LionEvent) => void) {}

	onEvent(event: LionEvent): void {
		if (event.type === "lion.task.approved" && event.taskId) {
			this.approvedTasks.add(this.key(event.runId, event.taskId));
		}

		if (event.type === "lion.task.marked_complete" && event.taskId) {
			const key = this.key(event.runId, event.taskId);
			if (!this.approvedTasks.has(key)) {
				this.emit({
					type: "lion.rule.violation",
					timestamp: Date.now(),
					runId: event.runId,
					planSlug: event.planSlug,
					planPath: event.planPath,
					taskId: event.taskId,
					rule: "complete-requires-approval",
					message: "Task was marked complete without a prior approved review verdict.",
				});
			}
		}
	}

	private key(runId: string, taskId: string): string {
		return `${runId}:${taskId}`;
	}
}
