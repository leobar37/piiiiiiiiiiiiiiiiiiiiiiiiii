import { describe, expect, it, vi } from "vitest";
import { executeSequential } from "../../src/execution/sequential.js";
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

describe("executeSequential", () => {
	it("runs instances one by one", async () => {
		const callOrder: number[] = [];
		const instances = [createMockInstance("task-1"), createMockInstance("task-2"), createMockInstance("task-3")];

		instances[0].start = vi.fn().mockImplementation(async () => {
			callOrder.push(0);
			return { taskId: "task-1", status: "completed" } as any;
		});
		instances[1].start = vi.fn().mockImplementation(async () => {
			callOrder.push(1);
			return { taskId: "task-2", status: "completed" } as any;
		});
		instances[2].start = vi.fn().mockImplementation(async () => {
			callOrder.push(2);
			return { taskId: "task-3", status: "completed" } as any;
		});

		await executeSequential(instances);
		expect(callOrder).toEqual([0, 1, 2]);
	});

	it("returns results in order", async () => {
		const instances = [createMockInstance("task-1"), createMockInstance("task-2")];
		const results = await executeSequential(instances);
		expect(results).toHaveLength(2);
		expect(results[0].taskId).toBe("task-1");
		expect(results[1].taskId).toBe("task-2");
	});

	it("with single instance returns single result", async () => {
		const instances = [createMockInstance("task-1")];
		const results = await executeSequential(instances);
		expect(results).toHaveLength(1);
		expect(results[0].taskId).toBe("task-1");
	});

	it("handles empty instances array", async () => {
		const results = await executeSequential([]);
		expect(results).toEqual([]);
	});

	it("error in one instance propagates and stops execution", async () => {
		const instances = [createMockInstance("task-1"), createMockInstance("task-2")];
		instances[0].start = vi.fn().mockRejectedValue(new Error("Failed"));

		await expect(executeSequential(instances)).rejects.toThrow("Failed");
		expect(instances[1].start).not.toHaveBeenCalled();
	});
});
