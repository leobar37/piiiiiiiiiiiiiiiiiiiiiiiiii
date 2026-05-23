import { describe, expect, it, vi } from "vitest";
import { executeChain } from "../../src/execution/chain.js";
import type { DelegationResult, DelegationTask } from "../../src/types.js";

function createMockInstance(taskId: string): import("../../src/instance.js").SubAgentInstance {
	return {
		start: vi.fn().mockResolvedValue({
			taskId,
			agent: "test-agent",
			status: "completed",
			summary: `Result for ${taskId}`,
			duration: 100,
			turnCount: 2,
			finalState: {} as any,
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

function makeTask(id: string, prompt = `Do ${id}`): DelegationTask {
	return { id, definition: "executor", prompt };
}

describe("executeChain", () => {
	it("passes output from previous to next (default append mode)", async () => {
		const tasks = [makeTask("t1", "First task"), makeTask("t2", "Second task")];
		const instances = [createMockInstance("t1"), createMockInstance("t2")];
		instances[0].start = vi.fn().mockResolvedValue({
			taskId: "t1",
			agent: "test-agent",
			status: "completed",
			summary: "Output from T1",
			duration: 50,
			turnCount: 1,
			finalState: {} as any,
		});

		await executeChain(instances, tasks);
		expect(instances[1].start).toHaveBeenCalled();
	});

	it("passes output from previous to next (replace mode)", async () => {
		const tasks = [makeTask("t1"), makeTask("t2")];
		const instances = [createMockInstance("t1"), createMockInstance("t2")];
		instances[0].start = vi.fn().mockResolvedValue({
			taskId: "t1",
			agent: "test-agent",
			status: "completed",
			summary: "Replaced",
			duration: 50,
			turnCount: 1,
			finalState: {} as any,
		});

		await executeChain(instances, tasks, { outputMode: "replace" });
		expect(instances[1].start).toHaveBeenCalled();
	});

	it("passes output from previous to next (template mode)", async () => {
		const tasks = [makeTask("t1"), makeTask("t2")];
		const instances = [createMockInstance("t1"), createMockInstance("t2")];
		instances[0].start = vi.fn().mockResolvedValue({
			taskId: "t1",
			agent: "test-agent",
			status: "completed",
			summary: "Data",
			duration: 50,
			turnCount: 1,
			finalState: {} as any,
		});

		await executeChain(instances, tasks, {
			outputMode: "template",
			template: "Context: {{output}}\nTask: {{prompt}}",
		});
		expect(instances[1].start).toHaveBeenCalled();
	});

	it("stops on failure when stopOnFailure=true", async () => {
		const tasks = [makeTask("t1"), makeTask("t2"), makeTask("t3")];
		const instances = [createMockInstance("t1"), createMockInstance("t2"), createMockInstance("t3")];

		instances[1].start = vi.fn().mockResolvedValue({
			taskId: "t2",
			agent: "test-agent",
			status: "failed",
			summary: "Broke",
			duration: 50,
			turnCount: 1,
			finalState: {} as any,
		});

		const results = await executeChain(instances, tasks, { stopOnFailure: true });
		expect(results).toHaveLength(2);
		expect(results[1].status).toBe("failed");
		expect(instances[2].start).not.toHaveBeenCalled();
	});

	it("continues on failure when stopOnFailure=false", async () => {
		const tasks = [makeTask("t1"), makeTask("t2"), makeTask("t3")];
		const instances = [createMockInstance("t1"), createMockInstance("t2"), createMockInstance("t3")];

		instances[1].start = vi.fn().mockResolvedValue({
			taskId: "t2",
			agent: "test-agent",
			status: "failed",
			summary: "Broke",
			duration: 50,
			turnCount: 1,
			finalState: {} as any,
		});

		const results = await executeChain(instances, tasks, { stopOnFailure: false });
		expect(results).toHaveLength(3);
		expect(instances[2].start).toHaveBeenCalled();
	});

	it("returns results for all executed tasks", async () => {
		const tasks = [makeTask("t1"), makeTask("t2")];
		const instances = [createMockInstance("t1"), createMockInstance("t2")];

		const results = await executeChain(instances, tasks);
		expect(results).toHaveLength(2);
		expect(results[0].taskId).toBe("t1");
		expect(results[1].taskId).toBe("t2");
	});

	it("with single instance", async () => {
		const tasks = [makeTask("t1")];
		const instances = [createMockInstance("t1")];
		const results = await executeChain(instances, tasks);
		expect(results).toHaveLength(1);
		expect(results[0].taskId).toBe("t1");
	});

	it("handles empty arrays", async () => {
		const results = await executeChain([], []);
		expect(results).toEqual([]);
	});
});
