import type { ChatMessage, SubAgentEvent } from "../types.ts";

export type DebugLevel = "debug" | "info" | "warn" | "error";

export interface DebugLedgerEntry {
	id: number;
	timestamp: number;
	level: DebugLevel;
	scope: string;
	action: string;
	threadId?: string;
	details?: unknown;
}

interface DebugSnapshot {
	entries: DebugLedgerEntry[];
	messages: Record<string, ChatMessage[]>;
	events: Record<string, SubAgentEvent[]>;
	scroll: Record<string, unknown>;
}

const MAX_ENTRIES = 500;

class DashboardDebugLedger {
	#entries: DebugLedgerEntry[] = [];
	#events = new Map<string, SubAgentEvent[]>();
	#messages = new Map<string, ChatMessage[]>();
	#scroll = new Map<string, unknown>();
	#nextId = 1;

	enabled(): boolean {
		return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false;
	}

	log(level: DebugLevel, scope: string, action: string, details?: unknown, threadId?: string): void {
		if (!this.enabled()) return;
		const entry: DebugLedgerEntry = {
			id: this.#nextId++,
			timestamp: Date.now(),
			level,
			scope,
			action,
			threadId,
			details: summarizeDetails(details),
		};
		this.#entries.push(entry);
		if (this.#entries.length > MAX_ENTRIES) this.#entries.shift();
		console.debug("[lion-dashboard]", entry);
	}

	recordEvent(event: SubAgentEvent): void {
		if (!this.enabled()) return;
		const eventKey = event.instanceId ?? "global";
		const existing = this.#events.get(eventKey) ?? [];
		this.#events.set(eventKey, [...existing, event].slice(-100));
		this.log("debug", "sse", event.type, summarizeEvent(event), event.instanceId);
	}

	recordMessages(threadId: string, messages: ChatMessage[], action: string): void {
		if (!this.enabled()) return;
		this.#messages.set(threadId, messages);
		this.log(
			"debug",
			"messages",
			action,
			messages.map((message) => ({
				id: message.id,
				role: message.role,
				blocks: message.blocks.length,
				partial: message.partial === true,
				streaming: message.streaming === true,
			})),
			threadId,
		);
	}

	recordScroll(threadId: string, state: unknown): void {
		if (!this.enabled()) return;
		this.#scroll.set(threadId, state);
		this.log("debug", "scroll", "state", state, threadId);
	}

	snapshot(): DebugSnapshot {
		return {
			entries: [...this.#entries],
			messages: Object.fromEntries(this.#messages.entries()),
			events: Object.fromEntries(this.#events.entries()),
			scroll: Object.fromEntries(this.#scroll.entries()),
		};
	}
}

export const dashboardDebugLedger = new DashboardDebugLedger();

export function installDashboardDebugGlobal(): void {
	if (!dashboardDebugLedger.enabled()) return;
	(window as unknown as { __LION_DASHBOARD_DEBUG__?: unknown }).__LION_DASHBOARD_DEBUG__ = {
		snapshot: () => dashboardDebugLedger.snapshot(),
		entries: () => dashboardDebugLedger.snapshot().entries,
	};
}

function summarizeEvent(event: SubAgentEvent): unknown {
	const sessionEvent = event.sessionEvent as { type?: string; message?: { role?: string; id?: string } } | undefined;
	return {
		type: event.type,
		taskId: event.taskId,
		sessionEvent: sessionEvent
			? {
					type: sessionEvent.type,
					role: sessionEvent.message?.role,
					messageId: sessionEvent.message?.id,
				}
			: undefined,
	};
}

function summarizeDetails(details: unknown): unknown {
	if (details instanceof Error) {
		return { name: details.name, message: details.message, stack: details.stack };
	}
	return details;
}
