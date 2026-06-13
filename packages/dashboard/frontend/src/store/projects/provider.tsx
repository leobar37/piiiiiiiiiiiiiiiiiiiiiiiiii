import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ProjectInfo } from "../../api-types.js";
import { getElectronApi } from "../../electron.js";
import { orpc } from "../../orpc.js";
import { createActions } from "../actions.js";
import { createOptimisticManager } from "../optimistic.js";
import { useSessionList } from "../hooks.js";
import { useSessionRuntime } from "../provider.js";
import type { SessionEntry } from "../runtime.js";

interface ProjectRuntimeValue {
	projects: ProjectInfo[];
	selectedProjectId: string | null;
	selectedProject: ProjectInfo | undefined;
	sessionsByProjectId: Map<string, SessionEntry[]>;
	visibleSessions: SessionEntry[];
	isCreatingProject: boolean;
	error: string | null;
	selectProject(projectId: string | null): void;
	loadProjects(): Promise<void>;
	createProjectFromDirectory(): Promise<ProjectInfo | null>;
	createSessionInSelectedProject(): Promise<{ id: string } | null>;
}

const ProjectRuntimeCtx = createContext<ProjectRuntimeValue | null>(null);

export function useProjectRuntime(): ProjectRuntimeValue {
	const ctx = useContext(ProjectRuntimeCtx);
	if (!ctx) throw new Error("useProjectRuntime must be used within ProjectRuntimeProvider");
	return ctx;
}

export function ProjectRuntimeProvider({ children }: { children: React.ReactNode }) {
	const runtime = useSessionRuntime();
	const sessionList = useSessionList();
	const [projects, setProjects] = useState<ProjectInfo[]>([]);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
	const [isCreatingProject, setIsCreatingProject] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const actions = useMemo(() => {
		const optimistic = createOptimisticManager(runtime);
		return createActions(runtime, optimistic);
	}, [runtime]);

	const loadProjects = useCallback(async () => {
		const result = await orpc.projects.list({});
		setProjects(result.projects);
	}, []);

	useEffect(() => {
		loadProjects().catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
		});
	}, [loadProjects]);

	const sessionsByProjectId = useMemo(() => {
		const map = new Map<string, SessionEntry[]>();
		for (const entry of sessionList) {
			const projectId = entry.info.projectId;
			if (!projectId) continue;
			const entries = map.get(projectId) ?? [];
			entries.push(entry);
			map.set(projectId, entries);
		}
		for (const entries of map.values()) {
			entries.sort((a, b) => b.info.lastActivityAt - a.info.lastActivityAt);
		}
		return map;
	}, [sessionList]);

	const selectedProject = projects.find((project) => project.id === selectedProjectId);
	const visibleSessions = selectedProjectId ? sessionsByProjectId.get(selectedProjectId) ?? [] : sessionList;

	const selectProject = useCallback((projectId: string | null) => {
		setSelectedProjectId(projectId);
	}, []);

	const createProjectFromDirectory = useCallback(async (): Promise<ProjectInfo | null> => {
		setError(null);
		setIsCreatingProject(true);
		try {
			const electron = getElectronApi();
			if (!electron) {
				throw new Error("Project creation requires the desktop app.");
			}
			const selectedPath = await electron.chooseProjectDirectory();
			if (!selectedPath) return null;
			const result = await orpc.projects.create({ defaultCwd: selectedPath });
			setProjects((current) => [result.project, ...current.filter((project) => project.id !== result.project.id)]);
			setSelectedProjectId(result.project.id);
			return result.project;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
			return null;
		} finally {
			setIsCreatingProject(false);
		}
	}, []);

	const createSessionInSelectedProject = useCallback(async () => {
		if (!selectedProjectId) return null;
		const session = await actions.createSession(selectedProjectId);
		if (session) {
			await loadProjects();
		}
		return session;
	}, [actions, loadProjects, selectedProjectId]);

	const value = useMemo<ProjectRuntimeValue>(
		() => ({
			projects,
			selectedProjectId,
			selectedProject,
			sessionsByProjectId,
			visibleSessions,
			isCreatingProject,
			error,
			selectProject,
			loadProjects,
			createProjectFromDirectory,
			createSessionInSelectedProject,
		}),
		[
			projects,
			selectedProjectId,
			selectedProject,
			sessionsByProjectId,
			visibleSessions,
			isCreatingProject,
			error,
			selectProject,
			loadProjects,
			createProjectFromDirectory,
			createSessionInSelectedProject,
		],
	);

	return <ProjectRuntimeCtx.Provider value={value}>{children}</ProjectRuntimeCtx.Provider>;
}
