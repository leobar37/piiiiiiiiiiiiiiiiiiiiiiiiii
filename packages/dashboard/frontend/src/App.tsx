import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentCanvas } from "./canvas/AgentCanvas.js";
import { SessionInspector } from "./sessions/SessionInspector.js";
import { SessionSidebar } from "./sessions/SessionSidebar.js";
import { resolveBackendUrl } from "./electron.js";
import { createSubagentsClient } from "./api/client.ts";
import type { CanvasSession } from "./canvas/types.js";
import type { CanvasProject } from "./projects/types.js";

const CANVAS_SESSIONS_KEY = "pi-dashboard:agent-canvas:sessions";
const CANVAS_PROJECTS_KEY = "pi-dashboard:agent-canvas:projects";
const SELECTED_PROJECT_KEY = "pi-dashboard:agent-canvas:selected-project";
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
				s &&
				typeof s === "object" &&
				"id" in s &&
				typeof s.id === "string" &&
				"name" in s &&
				typeof s.name === "string" &&
				"projectId" in s &&
				typeof s.projectId === "string" &&
				"cwd" in s &&
				typeof s.cwd === "string",
		);
	} catch {
		return [];
	}
}

function saveSessions(sessions: CanvasSession[]): void {
	window.localStorage.setItem(CANVAS_SESSIONS_KEY, JSON.stringify(sessions));
}

function loadSavedProjects(): CanvasProject[] {
	try {
		const raw = window.localStorage.getItem(CANVAS_PROJECTS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(project): project is CanvasProject =>
				project &&
				typeof project === "object" &&
				"id" in project &&
				typeof project.id === "string" &&
				"name" in project &&
				typeof project.name === "string" &&
				"defaultCwd" in project &&
				typeof project.defaultCwd === "string" &&
				"createdAt" in project &&
				typeof project.createdAt === "number" &&
				"updatedAt" in project &&
				typeof project.updatedAt === "number",
		);
	} catch {
		return [];
	}
}

function saveProjects(projects: CanvasProject[]): void {
	window.localStorage.setItem(CANVAS_PROJECTS_KEY, JSON.stringify(projects));
}

function loadSelectedProjectId(): string | null {
	try {
		return window.localStorage.getItem(SELECTED_PROJECT_KEY);
	} catch {
		return null;
	}
}

function saveSelectedProjectId(projectId: string | null): void {
	try {
		if (projectId) {
			window.localStorage.setItem(SELECTED_PROJECT_KEY, projectId);
		} else {
			window.localStorage.removeItem(SELECTED_PROJECT_KEY);
		}
	} catch {
		// best effort
	}
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

function directoryName(path: string): string {
	const normalized = path.replace(/\/+$/, "");
	const parts = normalized.split(/[\\/]/);
	return parts.at(-1) || normalized || "Project";
}

function normalizeCwd(path: string): string {
	return path.replace(/\/+$/, "");
}

function AppContent({ backendUrl }: { backendUrl: string }) {
	const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
	const [sessions, setSessions] = useState<CanvasSession[]>(() => loadSavedSessions());
	const [projects, setProjects] = useState<CanvasProject[]>(() => loadSavedProjects());
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => loadSelectedProjectId());
	const [leftOpen, setLeftOpen] = useState(() => loadSidebarOpen(LEFT_SIDEBAR_OPEN_KEY, true));
	const [rightOpen, setRightOpen] = useState(() => loadSidebarOpen(RIGHT_SIDEBAR_OPEN_KEY, true));
	const [createError, setCreateError] = useState<string | null>(null);
	const [projectError, setProjectError] = useState<string | null>(null);
	const client = useMemo(() => createSubagentsClient(backendUrl), [backendUrl]);

	useEffect(() => {
		saveSessions(sessions);
	}, [sessions]);

	useEffect(() => {
		saveProjects(projects);
	}, [projects]);

	useEffect(() => {
		saveSelectedProjectId(selectedProjectId);
	}, [selectedProjectId]);

	useEffect(() => {
		if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
			setSelectedProjectId(null);
		}
	}, [projects, selectedProjectId]);

	// Validate saved sessions against the backend on mount. Standalone sessions
	// live only in the backend process memory, so they disappear when the
	// backend restarts. Remove stale sessions instead of showing a stuck
	// "Loading..." iframe.
	useEffect(() => {
		let cancelled = false;
		async function validate() {
			const valid: CanvasSession[] = [];
			for (const session of sessions) {
				if (!session.threadId) {
					valid.push(session);
					continue;
				}
				try {
					await client.threads.get({ threadId: session.threadId });
					valid.push(session);
				} catch {
					// stale session
				}
			}
			if (!cancelled) {
				setSessions(valid);
			}
		}
		void validate();
		return () => {
			cancelled = true;
		};
	}, [client]);

	useEffect(() => {
		saveSidebarOpen(LEFT_SIDEBAR_OPEN_KEY, leftOpen);
	}, [leftOpen]);

	useEffect(() => {
		saveSidebarOpen(RIGHT_SIDEBAR_OPEN_KEY, rightOpen);
	}, [rightOpen]);

	const focusSession = useCallback((sessionId: string) => {
		setFocusedSessionId(sessionId);
	}, []);

	const selectProject = useCallback(
		(projectId: string | null) => {
			setSelectedProjectId(projectId);
			setFocusedSessionId((current) => {
				if (!current) return null;
				const focused = sessions.find((session) => session.id === current);
				if (!focused) return null;
				return projectId && focused.projectId !== projectId ? null : current;
			});
		},
		[sessions],
	);

	const createProject = useCallback(async () => {
		setProjectError(null);
		const directory = await window.__PI_ELECTRON__?.chooseProjectDirectory();
		if (!directory) {
			if (!window.__PI_ELECTRON__) {
				setProjectError("Project folders can only be selected from the Electron app.");
			}
			return;
		}

		const now = Date.now();
		const project: CanvasProject = {
			id: crypto.randomUUID(),
			name: directoryName(directory),
			defaultCwd: directory,
			createdAt: now,
			updatedAt: now,
		};
		setProjects((prev) => {
			const existing = prev.find((item) => item.defaultCwd === directory);
			if (existing) return prev;
			const next = [project, ...prev];
			saveProjects(next);
			return next;
		});
		setSelectedProjectId((current) => {
			const existing = projects.find((item) => item.defaultCwd === directory);
			return existing?.id ?? project.id ?? current;
		});
	}, [projects]);

	const createSession = useCallback(async () => {
		setCreateError(null);
		const selectedProject = projects.find((project) => project.id === selectedProjectId);
		if (!selectedProject) {
			setCreateError("Select or create a project before adding a session.");
			return;
		}

		const localId = crypto.randomUUID();
		const visibleSessionCount = sessions.filter((session) => session.projectId === selectedProject.id).length;
		const provisionalName = `Session ${visibleSessionCount + 1}`;
		const projectSessionFields = {
			projectId: selectedProject.id,
			cwd: selectedProject.defaultCwd,
		};
		setSessions((prev) => {
			const next = [
				...prev,
				{
					id: localId,
					name: provisionalName,
					createdAt: Date.now(),
					...projectSessionFields,
				},
			];
			saveSessions(next);
			return next;
		});
		setFocusedSessionId(localId);

		try {
			const result = await client.threads.create({ name: provisionalName, cwd: selectedProject.defaultCwd });
			const thread = await client.threads.get({ threadId: result.threadId });
			const backendCwd = thread.cwd ?? result.cwd;
			if (normalizeCwd(backendCwd) !== normalizeCwd(selectedProject.defaultCwd)) {
				throw new Error(`Backend created the session in ${backendCwd}, expected ${selectedProject.defaultCwd}`);
			}
			setSessions((prev) => {
				const next = prev.map((s) =>
					s.id === localId
						? {
							...s,
							threadId: result.threadId,
							name: result.name,
							createdAt: result.createdAt,
							...projectSessionFields,
							cwd: backendCwd,
						}
						: s,
				);
				saveSessions(next);
				return next;
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setCreateError(message);
			setSessions((prev) => {
				const next = prev.filter((session) => session.id !== localId);
				saveSessions(next);
				return next;
			});
			setFocusedSessionId((current) => (current === localId ? null : current));
		}
	}, [client, projects, selectedProjectId, sessions]);

	const removeSession = useCallback((sessionId: string) => {
		setSessions((prev) => {
			const next = prev.filter((s) => s.id !== sessionId);
			saveSessions(next);
			return next;
		});
		setFocusedSessionId((current) => (current === sessionId ? null : current));
	}, []);

	const focusedSession = sessions.find((session) => session.id === focusedSessionId);
	const visibleSessions = selectedProjectId ? sessions.filter((session) => session.projectId === selectedProjectId) : sessions;
	const canCreateSession = selectedProjectId ? projects.some((project) => project.id === selectedProjectId) : false;

	return (
		<div className="flex h-screen overflow-hidden bg-bg-base text-text-primary">
			<SessionSidebar
				isOpen={leftOpen}
				onToggle={() => setLeftOpen((open) => !open)}
				projects={projects}
				sessions={sessions}
				visibleSessions={visibleSessions}
				selectedProjectId={selectedProjectId}
				focusedSessionId={focusedSessionId}
				projectError={projectError}
				onSelectProject={selectProject}
				onCreateProject={createProject}
				onFocusSession={focusSession}
				onCreateSession={createSession}
				canCreateSession={canCreateSession}
				onRemoveSession={removeSession}
			/>
			<main className="relative min-w-0 flex-1">
				<AgentCanvas
					sessions={visibleSessions}
					backendUrl={backendUrl}
					focusedSessionId={focusedSessionId}
					onFocusSession={focusSession}
					onOpenSession={focusSession}
					onCreateSession={createSession}
					canCreateSession={canCreateSession}
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
