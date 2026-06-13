import { useEffect, useRef } from "react";
import { useSubAgentStore } from "../store/use-subagent-store.ts";
import { useSessionMessagesStore } from "../store/session-messages.ts";
import type { SubAgentEvent, SubAgentInstanceState } from "../types.ts";
import { convertAgentMessages } from "../utils/message-converter.ts";
import { generateNextEvent } from "../mocks/sse-emitter.ts";
import { dashboardDebugLedger } from "../dev/debug-ledger.ts";
import { queryClient } from "../lib/query-client.ts";
import { invalidateTaskQueries } from "../lib/task-query-cache.ts";
import { setThreadMessagesCache } from "../lib/thread-message-cache.ts";

function isDev(): boolean {
	return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV ?? false;
}

export function useSseEvents(instanceId?: string) {
	const storeRef = useRef(useSubAgentStore.getState());
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
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
					console.warn("[SSE] Inactivity timeout, reconnecting...");
					retryCount++;
					connect();
				}
			}, INACTIVITY_TIMEOUT_MS);
		};

		// In dev mode with MSW, use a local mock emitter instead of fetch SSE
		// because MSW Service Workers don't support ReadableStream responses well.
		let mockInterval: ReturnType<typeof setInterval> | null = null;
		let mockTimeout: ReturnType<typeof setTimeout> | null = null;

		const startMockEmitter = async () => {
			if (!isDev()) return false;
			// Only emit for the running mock agent
			if (instanceId && instanceId !== "subagent-task-1-abc123") return false;

			const agent = {
				instanceId: "subagent-task-1-abc123",
				taskId: "task-1",
				definitionName: "executor",
				parentThreadId: "main:mock-session",
				parentToolCallId: "main-tool-lion-tasks",
				runId: "mock-run-1",
				runIndex: 0,
				state: "running" as const,
				turnCount: 3,
				toolCount: 5,
				currentTool: null as string | null,
			};

			storeRef.current.setConnected(true);
			lastEventTime = Date.now();
			scheduleInactivityCheck();

			const emit = () => {
				if (cancelled) return;
				const event = generateNextEvent(agent);
				dashboardDebugLedger.recordEvent(event);
				storeRef.current.addEvent(event);
				syncDashboardQueries(event);
				handleSessionEvent(event);
				lastEventTime = Date.now();
				scheduleInactivityCheck();
				mockTimeout = setTimeout(emit, 2000 + Math.random() * 3000);
			};

			mockTimeout = setTimeout(emit, 1500);
			return true;
		};

		const connect = () => {
			if (cancelled) return;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}

			// Try mock emitter first in dev mode
			startMockEmitter().then((usedMock) => {
				if (usedMock) return;

				// Fall back to real SSE fetch -- filter by instanceId if provided
				const url = new URL("/events", window.location.origin);
				if (instanceId) {
					url.searchParams.set("instanceId", instanceId);
				}

				abortRef.current?.abort();
				const controller = new AbortController();
				abortRef.current = controller;

				fetch(url.href, { signal: controller.signal })
					.then(async (res) => {
						if (!res.ok || !res.body) {
							throw new Error(`HTTP ${res.status}`);
						}
						dashboardDebugLedger.log("info", "sse", "connected", { url: url.href }, instanceId);
						retryCount = 0;
						lastEventTime = Date.now();
						storeRef.current.setConnected(true);
						void queryClient.invalidateQueries({ refetchType: "active" });
						scheduleInactivityCheck();

						const reader = res.body.getReader();
						const decoder = new TextDecoder();
						let buffer = "";

						try {
							while (!cancelled) {
								const { done, value } = await reader.read();
								if (done) break;
								if (cancelled) break;

								buffer += decoder.decode(value, { stream: true });
								lastEventTime = Date.now();
								scheduleInactivityCheck();

								const lines = buffer.split("\n\n");
								buffer = lines.pop() ?? "";

								for (const chunk of lines) {
									const dataLine = chunk
										.split("\n")
										.find((l) => l.startsWith("data:"));
									if (!dataLine) continue;
									const json = dataLine.slice(5).trim();
									if (!json) continue;
									try {
										const event = JSON.parse(json) as SubAgentEvent;
										dashboardDebugLedger.recordEvent(event);
										storeRef.current.addEvent(event);
										syncDashboardQueries(event);
										handleSessionEvent(event);
									} catch {
										/* ignore malformed */
									}
								}
							}
						} catch (err) {
							if (!cancelled) {
								console.error("[SSE] Stream error:", err);
							}
						}

						if (!cancelled) {
							dashboardDebugLedger.log("warn", "sse", "reconnect", { retryCount }, instanceId);
							storeRef.current.setConnected(false);
							retryCount++;
							reconnectTimer = setTimeout(connect, getBackoffMs());
						}
					})
					.catch((err) => {
						if (!cancelled) {
							dashboardDebugLedger.log("error", "sse", "connection-error", err, instanceId);
							console.error("[SSE] Connection error:", err);
							storeRef.current.setConnected(false);
							retryCount++;
							reconnectTimer = setTimeout(connect, getBackoffMs());
						}
					});
			});
		};

		connect();

		return () => {
			cancelled = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			if (inactivityTimer) clearTimeout(inactivityTimer);
			if (mockInterval) clearInterval(mockInterval);
			if (mockTimeout) clearTimeout(mockTimeout);
			abortRef.current?.abort();
		};
	}, [instanceId]);

	function handleSessionEvent(event: SubAgentEvent): void {
		applySessionMessageEvent(event);
	}
}

export function applySessionMessageEvent(event: SubAgentEvent): void {
	if (event.type === "session.snapshot") {
		if (!event.instanceId || !Array.isArray(event.messages)) return;
		const messages = convertAgentMessages(event.instanceId, event.messages as Array<Record<string, unknown>>);
		useSessionMessagesStore.getState().setMessages(event.instanceId, messages);
		useSessionMessagesStore.getState().setStreaming(event.instanceId, false);
		syncMessageQuery(event.instanceId);
		return;
	}
	if (event.type === "session.message.complete") {
		if (!event.instanceId || typeof event.message !== "object" || event.message === null) return;
		const [message] = convertAgentMessages(event.instanceId, [event.message as Record<string, unknown>]);
		if (!message) return;
		useSessionMessagesStore.getState().finishMessage(event.instanceId, message);
		useSessionMessagesStore.getState().setStreaming(event.instanceId, false);
		syncMessageQuery(event.instanceId);
		return;
	}
	if (event.type !== "session.event") return;
	if (!event.instanceId) return;
	const sessionEvent = event.sessionEvent as { type?: string; message?: Record<string, unknown> } | undefined;
	if (!sessionEvent?.type) return;
	if (sessionEvent.type === "message_start" && sessionEvent.message) {
		const [message] = convertAgentMessages(event.instanceId, [sessionEvent.message]);
		if (message) useSessionMessagesStore.getState().startMessage(event.instanceId, message);
		useSessionMessagesStore.getState().setStreaming(event.instanceId, message?.role === "assistant");
		syncMessageQuery(event.instanceId);
		return;
	}
	if (sessionEvent.type === "message_update" && sessionEvent.message) {
		const [message] = convertAgentMessages(event.instanceId, [sessionEvent.message]);
		if (message) useSessionMessagesStore.getState().updatePartialMessage(event.instanceId, message);
		useSessionMessagesStore.getState().setStreaming(event.instanceId, message?.role === "assistant");
		syncMessageQuery(event.instanceId);
		return;
	}
	if (sessionEvent.type !== "message_end" || !sessionEvent.message) return;
	const [message] = convertAgentMessages(event.instanceId, [sessionEvent.message]);
	if (message) {
		useSessionMessagesStore.getState().finishMessage(event.instanceId, message);
		useSessionMessagesStore.getState().setStreaming(event.instanceId, false);
		syncMessageQuery(event.instanceId);
	}
}

export function syncDashboardQueries(event: SubAgentEvent): void {
	if (event.type === "task.changed") {
		invalidateTaskQueries(queryClient);
		return;
	}

	const instanceId = event.instanceId;
	if (!instanceId) return;

	if (event.type === "instance.created") {
		const created = buildCreatedThread(event);
		queryClient.setQueryData<SubAgentInstanceState[]>(["agents"], (current) => upsertThread(current, created));
		queryClient.setQueryData(["agent", instanceId], created);
		queryClient.invalidateQueries({ queryKey: ["agents"] });
		return;
	}

	if (event.type === "instance.state") {
		const nextState = readThreadState(event);
		if (!nextState) return;
		queryClient.setQueryData<SubAgentInstanceState[]>(["agents"], (current) => upsertThread(current, nextState));
		queryClient.setQueryData(["agent", instanceId], nextState);
		queryClient.invalidateQueries({ queryKey: ["agents"] });
		return;
	}

	if (event.type === "lifecycle.change") {
		const current = event.current;
		if (typeof current !== "string") return;
		queryClient.setQueryData<SubAgentInstanceState[]>(["agents"], (threads) =>
			updateThread(threads, instanceId, { state: current as SubAgentInstanceState["state"] }));
		queryClient.setQueryData<SubAgentInstanceState>(["agent", instanceId], (thread) =>
			thread ? { ...thread, state: current as SubAgentInstanceState["state"] } : thread);
		queryClient.invalidateQueries({ queryKey: ["agents"] });
		return;
	}

	if (event.type === "task.end" || event.type === "error") {
		const nextState: SubAgentInstanceState["state"] = event.type === "error" ? "failed" : readTaskEndState(event);
		queryClient.setQueryData<SubAgentInstanceState[]>(["agents"], (threads) =>
			updateThread(threads, instanceId, { state: nextState, currentTool: null, currentToolStartedAt: null }));
		queryClient.setQueryData<SubAgentInstanceState>(["agent", instanceId], (thread) =>
			thread ? { ...thread, state: nextState, currentTool: null, currentToolStartedAt: null } : thread);
		setTimeout(() => {
			queryClient.invalidateQueries({ queryKey: ["agents"] });
			queryClient.invalidateQueries({ queryKey: ["agent", instanceId] });
			queryClient.invalidateQueries({ queryKey: ["agent-run", instanceId] });
		}, 50);
	}
}

export function syncMessageQuery(instanceId: string): void {
	const messages = useSessionMessagesStore.getState().getMessages(instanceId);
	setThreadMessagesCache(queryClient, instanceId, messages);
}

function buildCreatedThread(event: SubAgentEvent): SubAgentInstanceState {
	const taskId = typeof event.taskId === "string" ? event.taskId : "unknown";
	const definitionName = typeof event.definitionName === "string" ? event.definitionName : "subagent";
	const now = Date.now();
	return {
		instanceId: event.instanceId ?? "unknown",
		taskId,
		definitionName,
		kind: event.kind === "main" ? "main" : "subagent",
		parentThreadId: typeof event.parentThreadId === "string" ? event.parentThreadId : undefined,
		parentToolCallId: typeof event.parentToolCallId === "string" ? event.parentToolCallId : undefined,
		runId: typeof event.runId === "string" ? event.runId : undefined,
		runIndex: typeof event.runIndex === "number" ? event.runIndex : undefined,
		description: typeof event.description === "string" ? event.description : "",
		state: "created",
		startTime: null,
		endTime: null,
		turnCount: 0,
		lastActivityAt: now,
		currentTool: null,
		error: null,
		toolCount: 0,
		currentToolStartedAt: null,
		durationMs: 0,
	};
}

function readThreadState(event: SubAgentEvent): SubAgentInstanceState | null {
	const state = event.state;
	if (!state || typeof state !== "object" || !("instanceId" in state)) return null;
	const candidate = state as Partial<SubAgentInstanceState>;
	if (typeof candidate.instanceId !== "string") return null;
	if (typeof candidate.taskId !== "string") return null;
	if (typeof candidate.definitionName !== "string") return null;
	if (typeof candidate.state !== "string") return null;
	return candidate as SubAgentInstanceState;
}

function readTaskEndState(event: SubAgentEvent): SubAgentInstanceState["state"] {
	const result = event.result;
	if (result && typeof result === "object" && "status" in result) {
		const status = (result as { status?: unknown }).status;
		if (status === "completed" || status === "blocked" || status === "timed_out" || status === "cancelled") {
			return status;
		}
	}
	return "failed";
}

function upsertThread(
	threads: SubAgentInstanceState[] | undefined,
	thread: SubAgentInstanceState,
): SubAgentInstanceState[] {
	const current = threads ?? [];
	const index = current.findIndex((candidate) => candidate.instanceId === thread.instanceId);
	if (index < 0) return [thread, ...current];
	return current.map((candidate) => (candidate.instanceId === thread.instanceId ? { ...candidate, ...thread } : candidate));
}

function updateThread(
	threads: SubAgentInstanceState[] | undefined,
	instanceId: string,
	patch: Partial<SubAgentInstanceState>,
): SubAgentInstanceState[] | undefined {
	if (!threads) return threads;
	return threads.map((thread) => (thread.instanceId === instanceId ? { ...thread, ...patch } : thread));
}
