import type { SubAgentEvent, SubAgentEventMap, SubAgentEventType } from "./types.js";

export class EventBusBase<TEvent extends { type: string }, TType extends string = string> {
	private listeners = new Map<TType | "*", Set<(event: TEvent) => void>>();

	on(type: TType | "*", listener: (event: TEvent) => void): () => void {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, new Set());
		}
		this.listeners.get(type)!.add(listener);

		return () => {
			this.listeners.get(type)?.delete(listener);
		};
	}

	emit(event: TEvent): void {
		const specific = this.listeners.get(event.type as TType);
		if (specific) {
			for (const listener of specific) {
				try {
					listener(event);
				} catch {
					// Best-effort event emission; swallow listener errors
				}
			}
		}
		const wildcard = this.listeners.get("*");
		if (wildcard) {
			for (const listener of wildcard) {
				try {
					listener(event);
				} catch {
					// Best-effort event emission; swallow listener errors
				}
			}
		}
	}

	subscribe(handler: (event: TEvent) => void): () => void {
		return this.on("*", handler);
	}

	clear(): void {
		this.listeners.clear();
	}
}

export class SubAgentEventBus extends EventBusBase<SubAgentEvent, SubAgentEventType> {
	on<T extends SubAgentEventType>(type: T | "*", listener: (event: SubAgentEventMap[T]) => void): () => void {
		return super.on(type, listener as (event: SubAgentEvent) => void);
	}
}
