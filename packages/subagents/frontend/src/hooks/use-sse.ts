import { useEffect, useRef } from "react";
import { useSubAgentStore } from "../store/use-subagent-store.ts";

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

			const { generateNextEvent } = await import("../mocks/sse-emitter.ts");
			const agent = {
				instanceId: "subagent-task-1-abc123",
				taskId: "task-1",
				definitionName: "executor",
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
				storeRef.current.addEvent(event);
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

				// Fall back to real SSE fetch
				const url = new URL("/events", window.location.origin);
				if (instanceId) url.searchParams.set("instanceId", instanceId);

				abortRef.current?.abort();
				const controller = new AbortController();
				abortRef.current = controller;

				fetch(url.href, { signal: controller.signal })
					.then(async (res) => {
						if (!res.ok || !res.body) {
							throw new Error(`HTTP ${res.status}`);
						}
						retryCount = 0;
						lastEventTime = Date.now();
						storeRef.current.setConnected(true);
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
										const event = JSON.parse(json);
										storeRef.current.addEvent(event);
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
							storeRef.current.setConnected(false);
							retryCount++;
							reconnectTimer = setTimeout(connect, getBackoffMs());
						}
					})
					.catch((err) => {
						if (!cancelled) {
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
}
