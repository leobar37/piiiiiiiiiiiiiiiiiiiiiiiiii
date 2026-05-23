import { describe, expect, it } from "vitest";
import { DashboardEventBridge } from "../src/bridge.js";
import { getDashboardState, streamDashboardEvents } from "../src/router.js";

function createMockBus(): {
	subscribe(handler: (event: unknown) => void): () => void;
	emit(event: Record<string, unknown>): void;
} {
	const handlers = new Set<(event: unknown) => void>();
	return {
		subscribe(handler) {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},
		emit(event) {
			for (const h of handlers) h(event);
		},
	};
}

describe("getDashboardState", () => {
	it("returns current state snapshot", async () => {
		const bridge = new DashboardEventBridge();
		const bus = createMockBus();
		bridge.bridge(bus, "lion");
		bus.emit({ id: "1", type: "test", payload: {}, timestamp: 1000 });

		const state = await getDashboardState(bridge, () => 5000);

		expect(state.bridgeCount).toBe(1);
		expect(state.subscriberCount).toBe(0);
		expect(state.recentEvents).toHaveLength(1);
		expect(state.uptime).toBeGreaterThanOrEqual(0);
		expect(state.lion).toBeNull();
	});

	it("includes lion state when a getter is provided", async () => {
		const bridge = new DashboardEventBridge();
		const state = await getDashboardState(
			bridge,
			() => 5000,
			() => ({
				active: true,
				mode: "building",
				activePlan: { slug: "plan-a", path: ".plans/plan-a", kind: "structured" },
				activeTask: { id: "T-001", title: "Implement bridge", status: "executing" },
				activeRun: { runId: "run-1", status: "executing", attempt: 1 },
				subagents: [],
				runHistory: [],
			}),
		);

		expect(state.lion).toMatchObject({
			active: true,
			activePlan: { slug: "plan-a" },
			activeRun: { runId: "run-1" },
		});
	});

	it("computes uptime from getStartTime", async () => {
		const bridge = new DashboardEventBridge();
		const state = await getDashboardState(bridge, () => 9000);
		expect(state.uptime).toBe(Date.now() - 9000);
	});
});

describe("streamDashboardEvents", () => {
	it("yields bridged events", async () => {
		const bridge = new DashboardEventBridge();
		const bus = createMockBus();
		bridge.bridge(bus, "lion");

		const controller = new AbortController();
		const generator = streamDashboardEvents(bridge, controller.signal, 10);

		// Start generator in background so it sets up subscriber
		const _promise = generator.next();

		// Emit after generator has started
		bus.emit({ id: "1", type: "test", payload: { v: 1 }, timestamp: 1000 });

		const result = await _promise;
		expect(result.done).toBe(false);
		expect(result.value).toMatchObject({ type: "test", source: "lion", payload: { v: 1 } });

		controller.abort();
		await generator.return(undefined);
	});

	it("increments subscriber on first next and decrements on cleanup", async () => {
		const bridge = new DashboardEventBridge();
		const controller = new AbortController();

		expect(bridge.getSubscriberCount()).toBe(0);
		const generator = streamDashboardEvents(bridge, controller.signal, 10);
		expect(bridge.getSubscriberCount()).toBe(0); // not yet started

		// Start generator — subscriber count increments inside
		const _promise = generator.next();
		// Wait for ping to resolve quickly
		await new Promise((r) => setTimeout(r, 30));
		expect(bridge.getSubscriberCount()).toBe(1);

		controller.abort();
		await generator.return(undefined);
		expect(bridge.getSubscriberCount()).toBe(0);
	});

	it("emits ping events after interval", async () => {
		const bridge = new DashboardEventBridge();
		const controller = new AbortController();
		const generator = streamDashboardEvents(bridge, controller.signal, 10);

		// Wait for ping
		await new Promise((r) => setTimeout(r, 30));

		const result = await generator.next();
		expect(result.done).toBe(false);
		expect(result.value).toMatchObject({ type: "ping", source: "lion", payload: null });

		controller.abort();
		await generator.return(undefined);
	});
});
