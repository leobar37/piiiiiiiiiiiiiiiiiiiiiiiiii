import { createStore } from "jotai";
import type { LiveSessionInfo, ServerEvent } from "@local/pi-dashboard";
import type { ModelInfo } from "../api-types.js";
import { createReactiveMap, type ReactiveMapAtoms } from "./reactive-map.js";
import { createDerivedIndex, type DerivedIndexAtoms } from "./derived-index.js";
import { applyEvent } from "./event-bridge.js";
import { orpc } from "../orpc.js";
import type { MessageBlock } from "./message-blocks.js";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface ChatMessage {
	id: string;
	sessionId: string;
	role: "user" | "assistant" | "tool" | "custom";
	blocks: MessageBlock[];
	timestamp: number;
	streaming: boolean;
	toolCallId?: string;
	toolName?: string;
	toolArgs?: unknown;
	toolResult?: unknown;
	toolIsError?: boolean;
	partial?: boolean;
	optimistic?: boolean;
}

export interface StreamingState {
	isStreaming: boolean;
	isCompacting: boolean;
	isRetrying: boolean;
	retryInfo: string | null;
	pendingSteering: readonly string[];
	pendingFollowUp: readonly string[];
}

function defaultStreamingState(): StreamingState {
	return {
		isStreaming: false,
		isCompacting: false,
		isRetrying: false,
		retryInfo: null,
		pendingSteering: [],
		pendingFollowUp: [],
	};
}

export interface SessionEntry {
	info: LiveSessionInfo;
	streaming: boolean;
	compacting: boolean;
	pendingMessages: number;
	model?: ModelInfo;
}

export interface SubagentEntry {
	id: string;
	parentId: string | null;
	sessionId: string;
	name: string;
	status: "running" | "completed" | "failed" | "cancelled";
	progress?: number;
	message?: string;
	result?: unknown;
	error?: string;
	startedAt: number;
	endedAt?: number;
}

// ---------------------------------------------------------------------------
// SessionRuntime
// ---------------------------------------------------------------------------

export interface SessionRuntime {
	store: ReturnType<typeof createStore>;
	maps: {
		sessions: ReactiveMapAtoms<string, SessionEntry>;
		messages: ReactiveMapAtoms<string, ChatMessage>;
		streaming: ReactiveMapAtoms<string, StreamingState>;
		subagents: ReactiveMapAtoms<string, SubagentEntry>;
	};
	indexes: {
		messagesBySession: DerivedIndexAtoms<string, ChatMessage, string>;
		sessionsByProjectId: DerivedIndexAtoms<string, SessionEntry, string>;
		subagentsBySession: DerivedIndexAtoms<string, SubagentEntry, string>;
		subagentTree: DerivedIndexAtoms<string, SubagentEntry, string | null>;
	};
	trackedSessions: Map<string, number>;
	trackSession(sessionId: string): void;
	untrackSession(sessionId: string): void;
	isTracked(sessionId: string): boolean;
	subscribeSession(sessionId: string): () => void;
	subscribeGlobal(): () => void;
}

export function createSessionRuntime(): SessionRuntime {
	const store = createStore();

	const sessions = createReactiveMap<string, SessionEntry>();
	const messages = createReactiveMap<string, ChatMessage>();
	const streaming = createReactiveMap<string, StreamingState>();
	const subagents = createReactiveMap<string, SubagentEntry>();

	const messagesBySession = createDerivedIndex(
		messages.mapAtom,
		(msg: ChatMessage) => msg.sessionId,
	);

	const sessionsByProjectId = createDerivedIndex(
		sessions.mapAtom,
		(entry: SessionEntry) => entry.info.projectId ?? "__unassigned__",
	);

	const subagentsBySession = createDerivedIndex(
		subagents.mapAtom,
		(sub: SubagentEntry) => sub.sessionId,
	);

	const subagentTree = createDerivedIndex(
		subagents.mapAtom,
		(sub: SubagentEntry) => sub.parentId,
	);

	const trackedSessions = new Map<string, number>();

	const trackSession = (sessionId: string) => {
		trackedSessions.set(sessionId, (trackedSessions.get(sessionId) ?? 0) + 1);
	};

	const untrackSession = (sessionId: string) => {
		const next = (trackedSessions.get(sessionId) ?? 0) - 1;
		if (next <= 0) {
			trackedSessions.delete(sessionId);
			const sessionMessageIds = store.get(messagesBySession.atomFor(sessionId));
			for (const msgId of sessionMessageIds) {
				store.set(messages.mapAtom, { type: "delete", key: msgId });
			}
			store.set(streaming.mapAtom, { type: "delete", key: sessionId });
			// Clean up subagents associated with this session
			const sessionSubagentIds = store.get(subagentsBySession.atomFor(sessionId));
			for (const subId of sessionSubagentIds) {
				store.set(subagents.mapAtom, { type: "delete", key: subId });
			}
		} else {
			trackedSessions.set(sessionId, next);
		}
	};

	const isTracked = (sessionId: string) => (trackedSessions.get(sessionId) ?? 0) > 0;

	const subscribeSession = (sessionId: string): (() => void) => {
		trackSession(sessionId);
		let cancelled = false;
		let retryCount = 0;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let lastEventTime = Date.now();
		let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

		const getBackoffMs = () => {
			const base = Math.min(1000 * 2 ** retryCount, 30000);
			const jitter = Math.random() * 1000;
			return base + jitter;
		};

		const INACTIVITY_TIMEOUT_MS = 45000; // 45s without any event = reconnect

		const scheduleInactivityCheck = () => {
			if (inactivityTimer) clearTimeout(inactivityTimer);
			inactivityTimer = setTimeout(() => {
				if (cancelled) return;
				const elapsed = Date.now() - lastEventTime;
				if (elapsed >= INACTIVITY_TIMEOUT_MS) {
					console.warn(`[SSE] Inactivity timeout for ${sessionId}, reconnecting...`);
					retryCount++;
					connect();
				}
			}, INACTIVITY_TIMEOUT_MS);
		};

		const connect = async () => {
			if (cancelled) return;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const stream = await (orpc as any).events.stream({ sessionId });
				retryCount = 0;
				lastEventTime = Date.now();
				scheduleInactivityCheck();
				try {
					for await (const event of stream) {
						if (cancelled) break;
						lastEventTime = Date.now();
						scheduleInactivityCheck();
						applyEvent(runtime, event);
					}
				} catch (err) {
					if (!cancelled) {
						console.error(`[SSE] Stream error for ${sessionId}:`, err);
					}
				}
				if (!cancelled) {
					console.warn(`[SSE] Stream ended for ${sessionId}, reconnecting in ${getBackoffMs()}ms...`);
					retryCount++;
					reconnectTimer = setTimeout(connect, getBackoffMs());
				}
			} catch (err) {
				if (!cancelled) {
					console.error(`[SSE] Connection error for ${sessionId}:`, err);
					retryCount++;
					reconnectTimer = setTimeout(connect, getBackoffMs());
				}
			}
		};

		connect();
		return () => {
			cancelled = true;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			if (inactivityTimer) {
				clearTimeout(inactivityTimer);
				inactivityTimer = null;
			}
			untrackSession(sessionId);
		};
	};

	// -------------------------------------------------------------------------
	// Global subscription — listens to all session events without a sessionId
	// -------------------------------------------------------------------------
	const subscribeGlobal = (): (() => void) => {
		let cancelled = false;
		let retryCount = 0;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
		let lastEventTime = Date.now();
		let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

		const getBackoffMs = () => {
			const base = Math.min(1000 * 2 ** retryCount, 30000);
			const jitter = Math.random() * 1000;
			return base + jitter;
		};

		const INACTIVITY_TIMEOUT_MS = 45000;

		const scheduleInactivityCheck = () => {
			if (inactivityTimer) clearTimeout(inactivityTimer);
			inactivityTimer = setTimeout(() => {
				if (cancelled) return;
				const elapsed = Date.now() - lastEventTime;
				if (elapsed >= INACTIVITY_TIMEOUT_MS) {
					console.warn("[SSE] Global inactivity timeout, reconnecting...");
					retryCount++;
					connect();
				}
			}, INACTIVITY_TIMEOUT_MS);
		};

		const connect = async () => {
			if (cancelled) return;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			try {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const stream = await (orpc as any).events.stream({});
				retryCount = 0;
				lastEventTime = Date.now();
				scheduleInactivityCheck();
				try {
					for await (const event of stream) {
						if (cancelled) break;
						lastEventTime = Date.now();
						scheduleInactivityCheck();
						applyEvent(runtime, event);
					}
				} catch (err) {
					if (!cancelled) {
						console.error("[SSE] Global stream error:", err);
					}
				}
				if (!cancelled) {
					console.warn(`[SSE] Global stream ended, reconnecting in ${getBackoffMs()}ms...`);
					retryCount++;
					reconnectTimer = setTimeout(connect, getBackoffMs());
				}
			} catch (err) {
				if (!cancelled) {
					console.error("[SSE] Global connection error:", err);
					retryCount++;
					reconnectTimer = setTimeout(connect, getBackoffMs());
				}
			}
		};

		connect();
		return () => {
			cancelled = true;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}
			if (inactivityTimer) {
				clearTimeout(inactivityTimer);
				inactivityTimer = null;
			}
		};
	};

	const runtime: SessionRuntime = {
		store,
		maps: { sessions, messages, streaming, subagents },
		indexes: { messagesBySession, sessionsByProjectId, subagentsBySession, subagentTree },
		trackedSessions,
		trackSession,
		untrackSession,
		isTracked,
		subscribeSession,
		subscribeGlobal,
	};

	return runtime;
}
