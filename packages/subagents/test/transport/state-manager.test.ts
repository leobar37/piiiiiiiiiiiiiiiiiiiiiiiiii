import { beforeEach, describe, expect, it } from "vitest";
import { DashboardStateManager } from "../../src/transport/state-manager.js";
import type { SubAgentEvent, SubAgentInstanceState, SubAgentRunRecord } from "../../src/types.js";

/**
 * A mock run store that can be used to seed virtual instances.
 */
function makeMockRunStore(records: SubAgentRunRecord[] = []) {
	return {
		list: async () => records,
	};
}

describe("DashboardStateManager", () => {
	let manager: DashboardStateManager;

	beforeEach(() => {
		manager = new DashboardStateManager("/tmp/test");
	});

	function makeStateEvent(instanceId: string, overrides: Partial<SubAgentInstanceState> = {}): SubAgentEvent {
		const state: SubAgentInstanceState = {
			instanceId,
			taskId: "test-task",
			definitionName: "dev",
			cwd: "/tmp/test",
			state: "running",
			startTime: Date.now(),
			endTime: null,
			turnCount: 0,
			lastActivityAt: Date.now(),
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 0,
			...overrides,
		};
		return {
			type: "instance.state",
			instanceId,
			taskId: "test-task",
			state,
			timestamp: Date.now(),
		} as SubAgentEvent;
	}

	function makeRunRecord(overrides: Partial<SubAgentRunRecord> = {}): SubAgentRunRecord {
		return {
			version: 1,
			sessionId: overrides.sessionId ?? "sess-1",
			taskId: overrides.taskId ?? "task-1",
			instanceId: overrides.instanceId ?? "inst-1",
			definitionName: overrides.definitionName ?? "executor",
			cwd: "/tmp/test",
			prompt: "Do something",
			status: "completed",
			startedAt: Date.now() - 60000,
			updatedAt: Date.now() - 10000,
			turnCount: 2,
			toolCount: 3,
			...overrides,
		};
	}

	it("loadFromRunStore() is a no-op when no runStore is provided", async () => {
		await manager.loadFromRunStore();
		const all = manager.getAllInstances();
		expect(all).toEqual([]);
	});

	it("appendEvent() updates live instance state", async () => {
		const event = makeStateEvent("inst-1");
		await manager.appendEvent("inst-1", event);

		expect(manager.isLive("inst-1")).toBe(true);

		const instance = manager.getInstance("inst-1");
		expect(instance).toBeDefined();
		expect(instance!.instanceId).toBe("inst-1");
		expect(instance!.state).toBe("running");
		expect(instance!.isLive).toBe(true);
	});

	it("registerLiveInstance() adds live instance", () => {
		const state: SubAgentInstanceState = {
			instanceId: "live-1",
			taskId: "task-1",
			definitionName: "dev",
			cwd: "/tmp/test",
			state: "running",
			startTime: Date.now(),
			endTime: null,
			turnCount: 0,
			lastActivityAt: Date.now(),
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 0,
		};
		manager.registerLiveInstance(state);

		expect(manager.isLive("live-1")).toBe(true);
		const instance = manager.getInstance("live-1");
		expect(instance).toBeDefined();
		expect(instance!.isLive).toBe(true);
	});

	it("unregisterLiveInstance() converts live to virtual", () => {
		const state: SubAgentInstanceState = {
			instanceId: "live-1",
			taskId: "task-1",
			definitionName: "dev",
			cwd: "/tmp/test",
			state: "running",
			startTime: Date.now(),
			endTime: null,
			turnCount: 0,
			lastActivityAt: Date.now(),
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 0,
		};
		manager.registerLiveInstance(state);
		expect(manager.isLive("live-1")).toBe(true);

		manager.unregisterLiveInstance("live-1");
		expect(manager.isLive("live-1")).toBe(false);

		// Virtual instance should still be available
		const virtual = manager.getInstance("live-1");
		expect(virtual).toBeDefined();
		expect(virtual!.isLive).toBe(false);
	});

	it("loadFromRunStore() creates virtual instances from run records", async () => {
		const runRecord = makeRunRecord({
			instanceId: "virtual-1",
			taskId: "task-v1",
			definitionName: "analyzer",
			status: "completed",
		});
		const managerWithStore = new DashboardStateManager("/tmp/test", makeMockRunStore([runRecord]));
		await managerWithStore.loadFromRunStore();

		const all = managerWithStore.getAllInstances();
		expect(all).toHaveLength(1);

		const virtual = all[0];
		expect(virtual.instanceId).toBe("virtual-1");
		expect(virtual.definitionName).toBe("analyzer");
		expect(virtual.state).toBe("completed");
		expect(virtual.isLive).toBe(false);
	});

	it("getAllInstances() returns merged live+virtual", async () => {
		const runRecord = makeRunRecord({
			instanceId: "virtual-1",
			taskId: "task-v1",
			definitionName: "analyzer",
			status: "completed",
		});
		const managerWithStore = new DashboardStateManager("/tmp/test", makeMockRunStore([runRecord]));
		await managerWithStore.loadFromRunStore();

		// Add a live instance
		const liveState: SubAgentInstanceState = {
			instanceId: "live-1",
			taskId: "task-l1",
			definitionName: "executor",
			cwd: "/tmp/test",
			state: "running",
			startTime: Date.now(),
			endTime: null,
			turnCount: 0,
			lastActivityAt: Date.now(),
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 0,
		};
		managerWithStore.registerLiveInstance(liveState);

		const all = managerWithStore.getAllInstances();
		expect(all).toHaveLength(2);

		const virtual = all.find((i) => i.instanceId === "virtual-1");
		expect(virtual).toBeDefined();
		expect(virtual!.isLive).toBe(false);

		const live = all.find((i) => i.instanceId === "live-1");
		expect(live).toBeDefined();
		expect(live!.isLive).toBe(true);
	});

	it("getInstance() returns correct instance", () => {
		const state: SubAgentInstanceState = {
			instanceId: "get-inst",
			taskId: "task-1",
			definitionName: "dev",
			cwd: "/tmp/test",
			state: "running",
			startTime: Date.now(),
			endTime: null,
			turnCount: 0,
			lastActivityAt: Date.now(),
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 0,
		};
		manager.registerLiveInstance(state);

		const found = manager.getInstance("get-inst");
		expect(found).toBeDefined();
		expect(found!.instanceId).toBe("get-inst");

		const notFound = manager.getInstance("nonexistent");
		expect(notFound).toBeUndefined();
	});

	it("isLive() returns correct status", () => {
		const state: SubAgentInstanceState = {
			instanceId: "live-check",
			taskId: "task-1",
			definitionName: "dev",
			cwd: "/tmp/test",
			state: "running",
			startTime: Date.now(),
			endTime: null,
			turnCount: 0,
			lastActivityAt: Date.now(),
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 0,
		};
		expect(manager.isLive("live-check")).toBe(false);
		manager.registerLiveInstance(state);
		expect(manager.isLive("live-check")).toBe(true);
		manager.unregisterLiveInstance("live-check");
		expect(manager.isLive("live-check")).toBe(false);
	});

	it("getEvents() returns live-process events for an instance", async () => {
		const event = makeStateEvent("inst-1");
		await manager.appendEvent("inst-1", event);

		const events = await manager.getEvents("inst-1");
		expect(events).toEqual([event]);
	});
});
