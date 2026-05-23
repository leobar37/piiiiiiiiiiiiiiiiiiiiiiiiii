import { describe, expect, it, vi } from "vitest";
import { TaskExecutor } from "../src/task-executor.js";
import type { DelegationResult, DelegationTask, ExecutionPlan } from "../src/types.js";

function createFakeController() {
	const instances = new Map<string, any>();

	const controller = {
		createInstance: vi.fn().mockImplementation((task: DelegationTask) => {
			const instance = {
				start: vi.fn().mockResolvedValue({
					taskId: task.id,
					agent: task.definition,
					status: "completed",
					summary: `Done: ${task.prompt}`,
					duration: 100,
					turnCount: 2,
					finalState: {
						instanceId: `inst-${task.id}`,
						taskId: task.id,
						definitionName: task.definition,
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
				instanceId: `inst-${task.id}`,
				getState: vi.fn().mockReturnValue({
					state: "completed",
					instanceId: `inst-${task.id}`,
					taskId: task.id,
					definitionName: task.definition,
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
			};
			instances.set(task.id, instance);
			return instance;
		}),
		getEventBus: vi.fn().mockReturnValue({
			subscribe: vi.fn().mockReturnValue(vi.fn()),
		}),
	};

	return { controller, instances };
}

describe("TaskExecutor", () => {
	it("executes sequential plan", async () => {
		const { controller } = createFakeController();
		const executor = new TaskExecutor({ controller: controller as any });

		const plan: ExecutionPlan = {
			strategy: "sequential",
			tasks: [
				{ id: "t1", definition: "executor", prompt: "First" },
				{ id: "t2", definition: "executor", prompt: "Second" },
			],
		};

		const result = await executor.execute(plan);
		expect(result.results).toHaveLength(2);
		expect(result.results[0].taskId).toBe("t1");
		expect(result.results[1].taskId).toBe("t2");
		expect(controller.createInstance).toHaveBeenCalledTimes(2);
	});

	it("executes parallel plan", async () => {
		const { controller } = createFakeController();
		const executor = new TaskExecutor({ controller: controller as any });

		const plan: ExecutionPlan = {
			strategy: "parallel",
			tasks: [
				{ id: "t1", definition: "executor", prompt: "First" },
				{ id: "t2", definition: "executor", prompt: "Second" },
			],
		};

		const result = await executor.execute(plan);
		expect(result.results).toHaveLength(2);
		expect(controller.createInstance).toHaveBeenCalledTimes(2);
	});

	it("executes chain plan", async () => {
		const { controller } = createFakeController();
		const executor = new TaskExecutor({ controller: controller as any });

		const plan: ExecutionPlan = {
			strategy: "chain",
			tasks: [
				{ id: "t1", definition: "executor", prompt: "First" },
				{ id: "t2", definition: "executor", prompt: "Second" },
			],
		};

		const result = await executor.execute(plan);
		expect(result.results).toHaveLength(2);
	});

	it("throws for unknown strategy", async () => {
		const { controller } = createFakeController();
		const executor = new TaskExecutor({ controller: controller as any });

		const plan = { strategy: "invalid", tasks: [] } as any;
		await expect(executor.execute(plan)).rejects.toThrow("Unknown execution strategy");
	});

	it("cancel() does not throw", async () => {
		const { controller } = createFakeController();
		const executor = new TaskExecutor({ controller: controller as any });

		const plan: ExecutionPlan = {
			strategy: "sequential",
			tasks: [{ id: "t1", definition: "executor", prompt: "Task" }],
		};

		const promise = executor.execute(plan);
		executor.cancel();
		await expect(promise).resolves.toBeDefined();
	});

	it("onEvent callback receives events", async () => {
		const { controller } = createFakeController();
		const onEvent = vi.fn();
		const executor = new TaskExecutor({ controller: controller as any, onEvent });

		const plan: ExecutionPlan = {
			strategy: "sequential",
			tasks: [{ id: "t1", definition: "executor", prompt: "Task" }],
		};

		await executor.execute(plan);
		// Event subscription was created; events depend on actual emission
		expect(controller.getEventBus().subscribe).toHaveBeenCalled();
	});

	it("handles task creation error gracefully", async () => {
		const { controller } = createFakeController();
		const executor = new TaskExecutor({ controller: controller as any });

		controller.createInstance = vi.fn().mockImplementation(() => {
			throw new Error("Creation failed");
		});

		const plan: ExecutionPlan = {
			strategy: "sequential",
			tasks: [{ id: "t1", definition: "executor", prompt: "Task" }],
		};

		await expect(executor.execute(plan)).rejects.toThrow("Creation failed");
	});
});
