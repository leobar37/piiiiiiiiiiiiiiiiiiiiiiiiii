import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentCanvas } from "./canvas/AgentCanvas.js";
import { SessionInspector } from "./sessions/SessionInspector.js";
import { SessionSidebar } from "./sessions/SessionSidebar.js";
import { resolveBackendUrl } from "./electron.js";
import { createSubagentsClient } from "./api/client.ts";
import type { CanvasSession } from "./canvas/types.js";

const CANVAS_SESSIONS_KEY = "pi-dashboard:agent-canvas:sessions";
const LEFT_SIDEBAR_OPEN_KEY = "pi-dashboard:sidebar-left:open";
const RIGHT_SIDEBAR_OPEN_KEY = "pi-dashboard:sidebar-right:open";

function loadSavedSessions(): CanvasSession[] {
	try {
		const raw = window.localStorage.getItem(CANVAS_SESSIONS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(s): s is CanvasSession =>
				s && typeof s === "object" && "id" in s && typeof s.id === "string" && "name" in s && typeof s.name === "string",
		);
	} catch {
		return [];
	}
}

function saveSessions(sessions: CanvasSession[]): void {
	window.localStorage.setItem(CANVAS_SESSIONS_KEY, JSON.stringify(sessions));
}

function loadSidebarOpen(key: string, defaultValue: boolean): boolean {
	try {
		const raw = window.localStorage.getItem(key);
		return raw ? raw === "true" : defaultValue;
	} catch {
		return defaultValue;
	}
}

function saveSidebarOpen(key: string, value: boolean): void {
	try {
		window.localStorage.setItem(key, String(value));
	} catch {
		// best effort
	}
}

function AppContent({ backendUrl }: { backendUrl: string }) {
	const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
	const [sessions, setSessions] = useState<CanvasSession[]>(() => loadSavedSessions());
	const [leftOpen, setLeftOpen] = useState(() => loadSidebarOpen(LEFT_SIDEBAR_OPEN_KEY, true));
	const [rightOpen, setRightOpen] = useState(() => loadSidebarOpen(RIGHT_SIDEBAR_OPEN_KEY, true));
	const [createError, setCreateError] = useState<string | null>(null);
	const client = useMemo(() => createSubagentsClient(backendUrl), [backendUrl]);

	useEffect(() => {
		saveSessions(sessions);
	}, [sessions]);

	useEffect(() => {
		saveSidebarOpen(LEFT_SIDEBAR_OPEN_KEY, leftOpen);
	}, [leftOpen]);

	useEffect(() => {
		saveSidebarOpen(RIGHT_SIDEBAR_OPEN_KEY, rightOpen);
	}, [rightOpen]);

	const focusSession = useCallback((sessionId: string) => {
		setFocusedSessionId(sessionId);
	}, []);

	const createSession = useCallback(async () => {
		setCreateError(null);
		const localId = crypto.randomUUID();
		const provisionalName = `Session ${sessions.length + 1}`;
		setSessions((prev) => {
			const next = [
				...prev,
				{
					id: localId,
					name: provisionalName,
					createdAt: Date.now(),
				},
			];
			saveSessions(next);
			return next;
		});
		setFocusedSessionId(localId);

		try {
			const result = await client.threads.create({ name: provisionalName });
			setSessions((prev) => {
				const next = prev.map((s) =>
					s.id === localId
						? {
								...s,
								threadId: result.threadId,
								name: result.name,
								createdAt: result.createdAt,
							}
						: s,
				);
				saveSessions(next);
				return next;
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setCreateError(message);
		}
	}, [client, sessions.length]);

	const removeSession = useCallback((sessionId: string) => {
		setSessions((prev) => {
			const next = prev.filter((s) => s.id !== sessionId);
			saveSessions(next);
			return next;
		});
		setFocusedSessionId((current) => (current === sessionId ? null : current));
	}, []);

	const focusedSession = sessions.find((session) => session.id === focusedSessionId);

	return (
		<div className="flex h-screen overflow-hidden bg-bg-base text-text-primary">
			<SessionSidebar
				isOpen={leftOpen}
				onToggle={() => setLeftOpen((open) => !open)}
				sessions={sessions}
				focusedSessionId={focusedSessionId}
				onFocusSession={focusSession}
				onCreateSession={createSession}
				onRemoveSession={removeSession}
			/>
			<main className="relative min-w-0 flex-1">
				<AgentCanvas
					sessions={sessions}
					backendUrl={backendUrl}
					focusedSessionId={focusedSessionId}
					onFocusSession={focusSession}
					onOpenSession={focusSession}
					onCreateSession={createSession}
					onRemoveSession={removeSession}
				/>
				{createError ? (
					<div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-2 text-sm text-error shadow-md">
						<span>Failed to create backend session: {createError}</span>
						<button
							type="button"
							onClick={() => setCreateError(null)}
							className="rounded px-1.5 py-0.5 hover:bg-error/20"
						>
							Dismiss
						</button>
					</div>
				) : null}
			</main>
			<SessionInspector
				isOpen={rightOpen}
				onToggle={() => setRightOpen((open) => !open)}
				session={focusedSession}
				backendUrl={backendUrl}
				onClose={() => setFocusedSessionId(null)}
			/>
		</div>
	);
}

export default function App() {
	const [backendUrl, setBackendUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		resolveBackendUrl()
			.then((url) => {
				if (url) {
					setBackendUrl(url);
				} else {
					setError("No backend URL available. Open this app through Electron or provide ?backendUrl=.");
				}
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : String(err));
			});
	}, []);

	if (error) {
		return (
			<div className="flex h-screen items-center justify-center bg-bg-base text-text-primary">
				<div className="max-w-md text-center">
					<div className="text-base font-semibold text-error">Failed to connect to agent backend</div>
					<div className="mt-2 text-sm text-text-secondary">{error}</div>
				</div>
			</div>
		);
	}

	if (!backendUrl) {
		return (
			<div className="flex h-screen items-center justify-center bg-bg-base text-text-primary">
				<div className="text-center">
					<div className="text-base font-semibold">Connecting to agent backend...</div>
					<div className="mt-2 text-sm text-text-secondary">Waiting for Electron to spawn the subagents process.</div>
				</div>
			</div>
		);
	}

	return <AppContent backendUrl={backendUrl} />;
}
