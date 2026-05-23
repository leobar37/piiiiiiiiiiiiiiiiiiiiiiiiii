import { EventPublisher } from "@orpc/server";
import type { DashboardEventPayload } from "./router.js";
import type { GenericEventBus } from "./types.js";

export class DashboardEventBridge {
	private publisher = new EventPublisher<Record<string, DashboardEventPayload>>();
	private subscriptions: Array<() => void> = [];
	private ringBuffer: DashboardEventPayload[] = [];
	private maxEvents = 100;
	private subscriberCounter = 0;

	bridge(bus: GenericEventBus, source: "lion" | "subagent"): () => void {
		const unsub = bus.subscribe((rawEvent: unknown) => {
			const event = rawEvent as Record<string, unknown>;
			const payload: DashboardEventPayload = {
				id: "id" in event ? String(event.id) : `${event.type}-${event.timestamp}`,
				type: String(event.type),
				source,
				payload: "payload" in event ? event.payload : event,
				timestamp: Number(event.timestamp),
			};
			this.publish(payload);
		});
		this.subscriptions.push(unsub);
		return () => {
			const idx = this.subscriptions.indexOf(unsub);
			if (idx !== -1) this.subscriptions.splice(idx, 1);
			unsub();
		};
	}

	publish(payload: DashboardEventPayload): void {
		this.ringBuffer.push(payload);
		if (this.ringBuffer.length > this.maxEvents) {
			this.ringBuffer.shift();
		}
		this.publisher.publish("*", payload);
	}

	getPublisher(): EventPublisher<Record<string, DashboardEventPayload>> {
		return this.publisher;
	}

	getRecentEvents(limit?: number): DashboardEventPayload[] {
		const n = limit ?? this.maxEvents;
		return this.ringBuffer.slice(-n);
	}

	getSubscriberCount(): number {
		return this.subscriberCounter;
	}

	incrementSubscribers(): void {
		this.subscriberCounter++;
	}

	decrementSubscribers(): void {
		this.subscriberCounter = Math.max(0, this.subscriberCounter - 1);
	}

	clear(): void {
		for (const unsub of this.subscriptions) {
			unsub();
		}
		this.subscriptions = [];
		this.ringBuffer = [];
	}

	get bridgeCount(): number {
		return this.subscriptions.length;
	}
}
