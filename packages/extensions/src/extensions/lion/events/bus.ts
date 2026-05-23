import { type AnyEventCreator, EventBusBase } from "@local/pi-subagents";
import type { LionEvent, LionEventMap, LionEventType } from "../types.js";

export class LionEventBus extends EventBusBase<LionEvent, LionEventType> {
	on<T extends LionEventType>(type: T, listener: (event: LionEventMap[T]) => void): () => void;
	on(type: "*", listener: (event: LionEvent) => void): () => void;
	on(type: LionEventType | "*", listener: (event: LionEvent) => void): () => void {
		return super.on(type, listener);
	}

	publish<C extends AnyEventCreator>(creator: C, payload: Parameters<C>[0]): void {
		const event = creator(payload);
		const flatEvent = {
			...event.payload,
			type: event.type,
			timestamp: event.timestamp,
		} as LionEvent;
		this.emit(flatEvent);
	}
}
