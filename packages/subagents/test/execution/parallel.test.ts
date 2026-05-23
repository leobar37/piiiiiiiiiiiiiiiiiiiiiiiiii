import { describe, expect, it, vi } from "vitest";
import { executeParallel } from "../../src/execution/parallel.js";
import type { DelegationResult } from "../../src/types.js";

function createMockInstance(taskId: string): import("../../src/instance.js").SubAgentInstance {
	return {
		start: vi.fn().mockResolvedValue({
			taskId,
			agent: "test-agent",
			status: "completed",
			summary: `Result for ${taskId}`,
			duration: 100,
			turnCount: 2,
			finalState: {
				instanceId: `inst-${taskId}`,
				taskId,
				definitionName: "test-agent",
				state: "completed",
				startTime: 0,
				endTime: 100,
				turnCount: 2,
				lastActivityAt: 100,
				currentTool: null,
				error: null,
				toolCount: 3,
				currentToolStartedAt: null,
				durationMs: 100,
			},
		} as DelegationResult),
		getState: vi.fn().mockReturnValue({
			instanceId: `inst-${taskId}`,
			taskId,
			definitionName: "test-agent",
			state: "completed",
			startTime: 0,
			endTime: 100,
			turnCount: 2,
			lastActivityAt: 100,
			currentTool: null,
			error: null,
			toolCount: 3,
			currentToolStartedAt: null,
			durationMs: 100,
		}),
		taskId,
		definitionName: "test-agent",
	} as any;
}

describe("executeParallel", () => {
	it("runs all instances", async () => {
		const instances = [createMockInstance("task-1"), createMockInstance("task-2"), createMockInstance("task-3")];

		await executeParallel(instances);
		expect(instances[0].start).toHaveBeenCalled();
		expect(instances[1].start).toHaveBeenCalled();
		expect(instances[2].start).toHaveBeenCalled();
	});

	it("returns results for all instances", async () => {
		const instances = [createMockInstance("task-1"), createMockInstance("task-2")];
		const results = await executeParallel(instances);
		expect(results).toHaveLength(2);
		expect(results[0].taskId).toBe("task-1");
		expect(results[1].taskId).toBe("task-2");
	});

	it("error in one instance produces failed result for that instance", async () => {
		const instances = [createMockInstance("task-1"), createMockInstance("task-2")];
		instances[0].start = vi.fn().mockRejectedValue(new Error("Task failed"));

		const results = await executeParallel(instances);
		expect(results).toHaveLength(2);
		expect(results[0].status).toBe("failed");
		expect(results[0].summary).toBe("Task failed");
		expect(results[1].status).toBe("completed");
	});

	it("other instances complete despite one failure", async () => {
		const instances = [createMockInstance("task-1"), createMockInstance("task-2"), createMockInstance("task-3")];
		instances[1].start = vi.fn().mockRejectedValue(new Error("Middle failed"));

		const results = await executeParallel(instances);
		expect(results[0].status).toBe("completed");
		expect(results[1].status).toBe("failed");
		expect(results[2].status).toBe("completed");
	});

	it("handles empty instances array", async () => {
		const results = await executeParallel([]);
		expect(results).toEqual([]);
	});
});
