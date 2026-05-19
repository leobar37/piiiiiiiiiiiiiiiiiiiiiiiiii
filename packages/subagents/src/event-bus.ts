import type { SubAgentEvent, SubAgentEventMap, SubAgentEventType } from "./types.js";

export class SubAgentEventBus {
	private listeners = new Map<SubAgentEventType | "*", Set<(event: SubAgentEvent) => void>>();

	on<T extends SubAgentEventType>(type: T | "*", listener: (event: SubAgentEventMap[T]) => void): () => void {
		const key = type;
		if (!this.listeners.has(key)) {
			this.listeners.set(key, new Set());
		}
		const wrapped = (event: SubAgentEvent) => listener(event as SubAgentEventMap[T]);
		this.listeners.get(key)!.add(wrapped);

		return () => {
			this.listeners.get(key)?.delete(wrapped);
		};
	}

	emit<T extends SubAgentEventType>(event: SubAgentEventMap[T]): void {
		const specific = this.listeners.get(event.type);
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

	off(type: SubAgentEventType | "*", listener: (event: SubAgentEvent) => void): void {
		this.listeners.get(type)?.delete(listener);
	}

	clear(): void {
		this.listeners.clear();
	}
}
