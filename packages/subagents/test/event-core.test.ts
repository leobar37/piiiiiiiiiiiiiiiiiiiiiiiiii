import { describe, expect, it, vi } from "vitest";
import { createEvent, TypedEventBus } from "../src/event-core.js";

describe("createEvent", () => {
	it("creates typed event creator with correct type", () => {
		const MyEvent = createEvent<"my-event", { value: number }>("my-event");
		expect(MyEvent.type).toBe("my-event");
	});

	it("creates events with timestamp and UUID", () => {
		const MyEvent = createEvent<"my-event", { value: number }>("my-event");
		const event = MyEvent({ value: 42 });
		expect(event.type).toBe("my-event");
		expect(event.payload).toEqual({ value: 42 });
		expect(typeof event.timestamp).toBe("number");
		expect(typeof event.id).toBe("string");
		expect(event.id.length).toBeGreaterThan(0);
	});

	it("match() narrows type correctly", () => {
		const MyEvent = createEvent<"my-event", { value: number }>("my-event");
		const OtherEvent = createEvent<"other", { name: string }>("other");

		const myEvent = MyEvent({ value: 42 });
		const otherEvent = OtherEvent({ name: "test" });

		expect(MyEvent.match(myEvent)).toBe(true);
		expect(MyEvent.match(otherEvent)).toBe(false);
	});

	it("match() returns false for events with different type string", () => {
		const MyEvent = createEvent<"my-event", { value: number }>("my-event");
		const genericEvent = { type: "not-my-event", payload: { value: 1 } };
		expect(MyEvent.match(genericEvent as { type: string })).toBe(false);
	});
});

describe("TypedEventBus", () => {
	it("publish dispatches to typed subscribers", () => {
		const bus = new TypedEventBus();
		const handler = vi.fn();

		const MyEvent = createEvent<"my-event", { value: number }>("my-event");
		bus.subscribe(MyEvent, handler);
		bus.publish(MyEvent, { value: 42 });

		expect(handler).toHaveBeenCalledTimes(1);
		const event = handler.mock.calls[0][0];
		expect(event.type).toBe("my-event");
		expect(event.payload).toEqual({ value: 42 });
	});

	it("publish dispatches to wildcard subscribers", () => {
		const bus = new TypedEventBus();
		const handler = vi.fn();

		const MyEvent = createEvent<"my-event", { value: number }>("my-event");
		bus.subscribe(handler);
		bus.publish(MyEvent, { value: 42 });

		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("size() returns correct listener count", () => {
		const bus = new TypedEventBus();
		const MyEvent = createEvent<"my-event", { value: number }>("my-event");

		expect(bus.size).toBe(0);

		bus.subscribe(MyEvent, vi.fn());
		bus.subscribe(vi.fn());

		expect(bus.size).toBe(2);
	});

	it("clear() resets size to 0", () => {
		const bus = new TypedEventBus();
		const MyEvent = createEvent<"my-event", { value: number }>("my-event");

		bus.subscribe(MyEvent, vi.fn());
		bus.subscribe(vi.fn());
		bus.clear();

		expect(bus.size).toBe(0);
	});

	it("supports multiple typed subscribers on same event", () => {
		const bus = new TypedEventBus();
		const h1 = vi.fn();
		const h2 = vi.fn();

		const MyEvent = createEvent<"my-event", { value: number }>("my-event");
		bus.subscribe(MyEvent, h1);
		bus.subscribe(MyEvent, h2);
		bus.publish(MyEvent, { value: 1 });

		expect(h1).toHaveBeenCalledTimes(1);
		expect(h2).toHaveBeenCalledTimes(1);
	});
});
