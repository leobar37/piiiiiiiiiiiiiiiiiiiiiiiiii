import React, { createContext, useContext, useMemo, useEffect } from "react";
import { Provider as JotaiProvider } from "jotai";
import { createSessionRuntime, type SessionRuntime } from "./runtime.js";
import { createOptimisticManager } from "./optimistic.js";
import { createActions } from "./actions.js";

const SessionRuntimeCtx = createContext<SessionRuntime | null>(null);

export function useSessionRuntime(): SessionRuntime {
	const ctx = useContext(SessionRuntimeCtx);
	if (!ctx) throw new Error("useSessionRuntime must be used within SessionRuntimeProvider");
	return ctx;
}

export function SessionRuntimeProvider({ children }: { children: React.ReactNode }) {
	const runtime = useMemo(() => createSessionRuntime(), []);

	// Load sessions on mount, subscribe to global events, and poll for external changes
	useEffect(() => {
		const optimistic = createOptimisticManager(runtime);
		const actions = createActions(runtime, optimistic);

		// Initial load
		actions.loadSessions().catch(() => {});

		// Subscribe to global SSE for session lifecycle events
		const unsubscribeGlobal = runtime.subscribeGlobal();

		// Poll every 10s to catch sessions created externally (e.g. from pi CLI)
		const pollInterval = setInterval(() => {
			actions.loadSessions().catch(() => {});
		}, 10000);

		return () => {
			unsubscribeGlobal();
			clearInterval(pollInterval);
		};
	}, [runtime]);

	return (
		<JotaiProvider store={runtime.store}>
			<SessionRuntimeCtx.Provider value={runtime}>{children}</SessionRuntimeCtx.Provider>
		</JotaiProvider>
	);
}
