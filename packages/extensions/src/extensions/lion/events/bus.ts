import type { LionEvent, LionEventMap, LionEventType } from "../types.js";

type LionListener<T extends LionEventType> = (event: LionEventMap[T]) => void;

export class LionEventBus {
	private listeners = new Map<LionEventType | "*", Set<(event: LionEvent) => void>>();

	on<T extends LionEventType>(type: T | "*", listener: LionListener<T>): () => void {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		const wrapped = (event: LionEvent) => listener(event as LionEventMap[T]);
		this.listeners.get(type)?.add(wrapped);
		return () => this.listeners.get(type)?.delete(wrapped);
	}

	emit<T extends LionEventType>(event: LionEventMap[T]): void {
		for (const listener of this.listeners.get(event.type) ?? []) {
			try {
				listener(event);
			} catch {
				// Best-effort event emission.
			}
		}
		for (const listener of this.listeners.get("*") ?? []) {
			try {
				listener(event);
			} catch {
				// Best-effort event emission.
			}
		}
	}

	clear(): void {
		this.listeners.clear();
	}
}
