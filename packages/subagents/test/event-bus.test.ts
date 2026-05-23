import { describe, expect, it, vi } from "vitest";
import { EventBusBase, SubAgentEventBus } from "../src/event-bus.js";
import type { SubAgentEventMap } from "../src/types.js";

describe("EventBusBase", () => {
	type TestEvent = { type: "a" | "b"; payload: string };

	it("subscribes and emits to specific type", () => {
		const bus = new EventBusBase<TestEvent, "a" | "b">();
		const handler = vi.fn();

		bus.on("a", handler);
		bus.emit({ type: "a", payload: "hello" });

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({ type: "a", payload: "hello" });
	});

	it("does not emit to unsubscribed type", () => {
		const bus = new EventBusBase<TestEvent, "a" | "b">();
		const handler = vi.fn();

		bus.on("a", handler);
		bus.emit({ type: "b", payload: "world" });

		expect(handler).not.toHaveBeenCalled();
	});

	it("subscribes and emits to wildcard (*)", () => {
		const bus = new EventBusBase<TestEvent, "a" | "b">();
		const handler = vi.fn();

		bus.on("*", handler);
		bus.emit({ type: "a", payload: "hello" });
		bus.emit({ type: "b", payload: "world" });

		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("unsubscribe removes listener", () => {
		const bus = new EventBusBase<TestEvent, "a" | "b">();
		const handler = vi.fn();

		const unsub = bus.on("a", handler);
		unsub();

		bus.emit({ type: "a", payload: "hello" });
		expect(handler).not.toHaveBeenCalled();
	});

	it("swallows listener errors (best-effort)", () => {
		const bus = new EventBusBase<TestEvent, "a" | "b">();
		const errorHandler = vi.fn().mockImplementation(() => {
			throw new Error("listener error");
		});
		const okHandler = vi.fn();

		bus.on("a", errorHandler);
		bus.on("a", okHandler);

		expect(() => {
			bus.emit({ type: "a", payload: "test" });
		}).not.toThrow();

		expect(okHandler).toHaveBeenCalledTimes(1);
	});

	it("clear() removes all listeners", () => {
		const bus = new EventBusBase<TestEvent, "a" | "b">();
		const handler = vi.fn();

		bus.on("a", handler);
		bus.on("*", handler);
		bus.clear();

		bus.emit({ type: "a", payload: "test" });
		expect(handler).not.toHaveBeenCalled();
	});

	it("subscribe() is alias for on('*')", () => {
		const bus = new EventBusBase<TestEvent, "a" | "b">();
		const handler = vi.fn();

		bus.subscribe(handler);
		bus.emit({ type: "a", payload: "hello" });

		expect(handler).toHaveBeenCalledWith({ type: "a", payload: "hello" });
	});

	it("wildcard receives events even with no specific listeners", () => {
		const bus = new EventBusBase<TestEvent, "a" | "b">();
		const handler = vi.fn();

		bus.on("*", handler);
		bus.emit({ type: "a", payload: "hello" });

		expect(handler).toHaveBeenCalledTimes(1);
	});
});

describe("SubAgentEventBus", () => {
	function makeLifecycleEvent(
		overrides: Partial<SubAgentEventMap["lifecycle.change"]> = {},
	): SubAgentEventMap["lifecycle.change"] {
		return {
			type: "lifecycle.change",
			instanceId: "inst-1",
			previous: "created",
			current: "running",
			timestamp: Date.now(),
			...overrides,
		};
	}

	function makeTaskEvent(overrides: Partial<SubAgentEventMap["task.start"]> = {}): SubAgentEventMap["task.start"] {
		return {
			type: "task.start",
			instanceId: "inst-1",
			taskId: "task-1",
			definitionName: "test-agent",
			timestamp: Date.now(),
			...overrides,
		};
	}

	it("emits and receives lifecylce.change events", () => {
		const bus = new SubAgentEventBus();
		const handler = vi.fn();

		bus.on("lifecycle.change", handler);
		const event = makeLifecycleEvent();
		bus.emit(event);

		expect(handler).toHaveBeenCalledWith(event);
	});

	it("emits and receives task.start events", () => {
		const bus = new SubAgentEventBus();
		const handler = vi.fn();

		bus.on("task.start", handler);
		const event = makeTaskEvent();
		bus.emit(event);

		expect(handler).toHaveBeenCalledWith(event);
	});

	it("typed on() returns unsubscribe function", () => {
		const bus = new SubAgentEventBus();
		const handler = vi.fn();

		const unsub = bus.on("lifecycle.change", handler);
		unsub();

		bus.emit(makeLifecycleEvent());
		expect(handler).not.toHaveBeenCalled();
	});

	it("subscribe works with wildcard", () => {
		const bus = new SubAgentEventBus();
		const handler = vi.fn();

		bus.subscribe(handler);
		bus.emit(makeLifecycleEvent());
		bus.emit(makeTaskEvent());

		expect(handler).toHaveBeenCalledTimes(2);
	});
});
