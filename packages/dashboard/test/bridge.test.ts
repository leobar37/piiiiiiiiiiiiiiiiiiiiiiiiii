import { describe, expect, it } from "vitest";
import { DashboardEventBridge } from "../src/bridge.js";
import type { GenericEventBus } from "../src/types.js";

function createMockBus(): GenericEventBus & { emit(event: Record<string, unknown>): void } {
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

describe("DashboardEventBridge", () => {
	it("returns empty recent events initially", () => {
		const bridge = new DashboardEventBridge();
		expect(bridge.getRecentEvents()).toEqual([]);
		expect(bridge.bridgeCount).toBe(0);
		expect(bridge.getSubscriberCount()).toBe(0);
	});

	it("bridges events from a GenericEventBus", () => {
		const bridge = new DashboardEventBridge();
		const bus = createMockBus();
		bridge.bridge(bus, "lion");

		bus.emit({ id: "1", type: "task.start", payload: { foo: 1 }, timestamp: 1000 });

		expect(bridge.getRecentEvents()).toHaveLength(1);
		expect(bridge.getRecentEvents()[0]).toMatchObject({
			id: "1",
			type: "task.start",
			source: "lion",
			timestamp: 1000,
		});
		expect(bridge.bridgeCount).toBe(1);
	});

	it("publishes enriched events directly", () => {
		const bridge = new DashboardEventBridge();

		bridge.publish({
			id: "enriched-1",
			type: "task.start",
			source: "subagent",
			payload: { taskId: "T-001" },
			timestamp: 1234,
			runId: "run-1",
			planSlug: "plan-a",
			planPath: ".plans/plan-a",
			taskId: "T-001",
			attempt: 1,
		});

		expect(bridge.getRecentEvents()[0]).toMatchObject({
			id: "enriched-1",
			source: "subagent",
			runId: "run-1",
			planSlug: "plan-a",
			taskId: "T-001",
			attempt: 1,
		});
	});

	it("tracks subscriber count", () => {
		const bridge = new DashboardEventBridge();
		expect(bridge.getSubscriberCount()).toBe(0);
		bridge.incrementSubscribers();
		expect(bridge.getSubscriberCount()).toBe(1);
		bridge.incrementSubscribers();
		expect(bridge.getSubscriberCount()).toBe(2);
		bridge.decrementSubscribers();
		expect(bridge.getSubscriberCount()).toBe(1);
	});

	it("subscriber count never goes below zero", () => {
		const bridge = new DashboardEventBridge();
		bridge.decrementSubscribers();
		expect(bridge.getSubscriberCount()).toBe(0);
	});

	it("forwards events to EventPublisher subscribers", async () => {
		const bridge = new DashboardEventBridge();
		const bus = createMockBus();
		bridge.bridge(bus, "subagent");

		const publisher = bridge.getPublisher();
		const events: unknown[] = [];
		const sub = publisher.subscribe("*");
		const consume = async () => {
			for await (const e of sub) {
				events.push(e);
				if (events.length >= 2) break;
			}
		};

		const promise = consume();
		bus.emit({ id: "a", type: "turn.complete", payload: {}, timestamp: 2000 });
		bus.emit({ id: "b", type: "tool.execute", payload: {}, timestamp: 3000 });
		await promise;

		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({ type: "turn.complete", source: "subagent" });
		expect(events[1]).toMatchObject({ type: "tool.execute", source: "subagent" });
	});

	it("limits ring buffer to maxEvents", () => {
		const bridge = new DashboardEventBridge();
		const bus = createMockBus();
		bridge.bridge(bus, "lion");

		for (let i = 0; i < 150; i++) {
			bus.emit({ id: String(i), type: "evt", payload: {}, timestamp: i });
		}

		expect(bridge.getRecentEvents()).toHaveLength(100);
		expect(bridge.getRecentEvents()[0].id).toBe("50");
	});

	it("getRecentEvents respects limit parameter", () => {
		const bridge = new DashboardEventBridge();
		const bus = createMockBus();
		bridge.bridge(bus, "lion");

		for (let i = 0; i < 50; i++) {
			bus.emit({ id: String(i), type: "evt", payload: {}, timestamp: i });
		}

		expect(bridge.getRecentEvents(10)).toHaveLength(10);
		expect(bridge.getRecentEvents(10)[0].id).toBe("40");
	});

	it("individual bus cleanup removes only its subscription", () => {
		const bridge = new DashboardEventBridge();
		const busA = createMockBus();
		const busB = createMockBus();

		const unsubA = bridge.bridge(busA, "lion");
		bridge.bridge(busB, "subagent");

		busA.emit({ id: "1", type: "a", payload: {}, timestamp: 1 });
		expect(bridge.getRecentEvents()).toHaveLength(1);

		unsubA();
		busA.emit({ id: "2", type: "a", payload: {}, timestamp: 2 });
		busB.emit({ id: "3", type: "b", payload: {}, timestamp: 3 });

		expect(bridge.getRecentEvents()).toHaveLength(2);
		expect(bridge.bridgeCount).toBe(1);
	});

	it("clear removes all subscriptions and events", () => {
		const bridge = new DashboardEventBridge();
		const bus = createMockBus();
		bridge.bridge(bus, "lion");
		bus.emit({ id: "1", type: "evt", payload: {}, timestamp: 1 });

		bridge.clear();
		expect(bridge.getRecentEvents()).toEqual([]);
		expect(bridge.bridgeCount).toBe(0);
	});

	it("bridges multiple buses with correct source labels", () => {
		const bridge = new DashboardEventBridge();
		const lionBus = createMockBus();
		const subBus = createMockBus();

		bridge.bridge(lionBus, "lion");
		bridge.bridge(subBus, "subagent");

		lionBus.emit({ id: "1", type: "build.start", payload: {}, timestamp: 1 });
		subBus.emit({ id: "2", type: "task.start", payload: {}, timestamp: 2 });

		const events = bridge.getRecentEvents();
		expect(events[0].source).toBe("lion");
		expect(events[1].source).toBe("subagent");
	});

	it("handles events without explicit id or payload", () => {
		const bridge = new DashboardEventBridge();
		const bus = createMockBus();
		bridge.bridge(bus, "lion");

		bus.emit({ type: "simple", timestamp: 42 });

		const ev = bridge.getRecentEvents()[0];
		expect(ev.type).toBe("simple");
		expect(ev.timestamp).toBe(42);
		expect(ev.id).toBe("simple-42");
		expect(ev.payload).toEqual({ type: "simple", timestamp: 42 });
	});
});
