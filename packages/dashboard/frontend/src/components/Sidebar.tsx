/**
 * Sidebar — ChatGPT-style hierarchical navigation.
 * Sections: global actions, temporal chat groups, expandable projects.
 */

import { useState, useCallback } from "react";

import { useProjectRuntime } from "../store/index.js";
import { navigateToSession } from "../App.js";

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

function IconPlus(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
		</svg>
	);
}

function IconSearch(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
		</svg>
	);
}

function IconChevronRight(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
		</svg>
	);
}

function IconChevronDown(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
		</svg>
	);
}

function IconSparkles(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
		</svg>
	);
}

function IconPanelLeftClose(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
		</svg>
	);
}

function IconPanelLeftOpen(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
		</svg>
	);
}

function IconMessageSquare(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
		</svg>
	);
}

function IconFolder(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
		</svg>
	);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SidebarProps {
	activeSessionId: string | null;
}

export function Sidebar({ activeSessionId }: SidebarProps) {
	const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
	const [collapsed, setCollapsed] = useState(false);
	const {
		projects,
		selectedProjectId,
		selectedProject,
		sessionsByProjectId,
		visibleSessions,
		isCreatingProject,
		error,
		selectProject,
		createProjectFromDirectory,
		createSessionInSelectedProject,
	} = useProjectRuntime();

	const toggleProject = (projectId: string) => {
		const next = new Set(expandedProjects);
		if (next.has(projectId)) {
			next.delete(projectId);
		} else {
			next.add(projectId);
		}
		setExpandedProjects(next);
	};

	const handleNewChat = useCallback(async () => {
		const session = await createSessionInSelectedProject();
		if (session) {
			navigateToSession(session.id);
		}
	}, [createSessionInSelectedProject]);

	const handleAddProject = useCallback(async () => {
		const project = await createProjectFromDirectory();
		if (project) {
			setExpandedProjects((current) => new Set(current).add(project.id));
		}
	}, [createProjectFromDirectory]);

	// -----------------------------------------------------------------------
	// Collapsed state
	// -----------------------------------------------------------------------

	if (collapsed) {
		return (
			<aside className="flex flex-col items-center w-12 bg-bg-sidebar border-r border-border-subtle py-3 gap-3 select-none">
				<button
					onClick={() => setCollapsed(false)}
					className="text-text-secondary hover:text-text-primary p-1.5 rounded-md hover:bg-bg-hover transition-colors"
					title="Expand sidebar"
				>
					<IconPanelLeftOpen className="w-5 h-5" />
				</button>
				<div
					className="w-2 h-2 rounded-full bg-success"
					title="Connected"
				/>
			</aside>
		);
	}

	// -----------------------------------------------------------------------
	// Expanded state
	// -----------------------------------------------------------------------

	return (
		<aside className="flex flex-col w-64 bg-bg-elevated border-r border-border-subtle h-full overflow-hidden select-none">
			{/* Header */}
			<div className="flex items-center justify-between px-3.5 py-3.5 border-b border-border-subtle">
				<button
					onClick={() => navigateToSession(null)}
					className="text-base font-semibold tracking-tight text-text-primary hover:text-text-secondary transition-colors"
				>
					Pi
				</button>
				<div className="flex items-center gap-2">
					<button
						onClick={handleNewChat}
						disabled={!selectedProjectId}
						className="text-text-secondary hover:text-text-primary p-1 rounded-md hover:bg-bg-surface transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
						title="New chat"
					>
						<IconPlus className="w-4 h-4" />
					</button>
					<button
						onClick={() => setCollapsed(true)}
						className="text-text-tertiary hover:text-text-secondary p-1 rounded-md hover:bg-bg-surface transition-colors"
						title="Collapse sidebar"
					>
						<IconPanelLeftClose className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Global actions */}
			<div className="px-3 py-2.5 flex flex-col gap-0.5">
				<button
					onClick={() => selectProject(null)}
					className={`w-full rounded-lg px-3 py-2 text-sm transition-colors flex items-center gap-2.5 ${
						selectedProjectId === null
							? "bg-bg-surface text-text-primary"
							: "text-text-secondary hover:bg-bg-surface hover:text-text-primary"
					}`}
				>
					<IconSparkles className="w-4 h-4" />
					Global
				</button>

				<button className="w-full rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-bg-surface hover:text-text-primary transition-colors flex items-center gap-2.5">
					<IconSearch className="w-4 h-4" />
					Search
				</button>

				<button
					onClick={handleAddProject}
					disabled={isCreatingProject}
					className="w-full rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-bg-surface hover:text-text-primary transition-colors flex items-center gap-2.5 disabled:opacity-50"
				>
					<IconFolder className="w-4 h-4" />
					{isCreatingProject ? "Choosing..." : "Add Project"}
				</button>
			</div>

			{/* Divider */}
			<div className="mx-3.5 h-px bg-border-subtle my-1" />

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto min-h-0">
				{error && (
					<div className="mx-3 my-2 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-xs text-error">
						{error}
					</div>
				)}

				{selectedProject && (
					<div className="px-3 py-2">
						<div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
							Project Canvas
						</div>
						<div className="px-3 py-1 text-sm font-medium text-text-primary truncate">
							{selectedProject.name}
						</div>
						{selectedProject.defaultCwd && (
							<div className="px-3 pb-2 text-[11px] text-text-muted truncate">
								{selectedProject.defaultCwd}
							</div>
						)}
					</div>
				)}

				{!selectedProject && (
					<div className="px-3 py-2">
						<div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
							Projects
						</div>
						{projects.map((project) => {
							const entries = sessionsByProjectId.get(project.id) ?? [];
							const isExpanded = expandedProjects.has(project.id);

							return (
								<div key={project.id}>
									<div className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-bg-surface hover:text-text-primary transition-colors">
										<button
											onClick={() => selectProject(project.id)}
											className="min-w-0 flex-1 flex items-center gap-2 text-left"
										>
											<IconFolder className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
											<span className="truncate flex-1">{project.name}</span>
											<span className="text-[10px] text-text-muted flex-shrink-0">
												{entries.length}
											</span>
										</button>
										<button
											onClick={() => toggleProject(project.id)}
											className="p-0.5 rounded hover:bg-bg-hover"
											title={isExpanded ? "Collapse project" : "Expand project"}
										>
											{isExpanded ? (
												<IconChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
											) : (
												<IconChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
											)}
										</button>
									</div>

									{isExpanded && (
										<div className="flex flex-col gap-0.5 pl-8 pr-1">
											{entries.map((entry) => (
												<button
													key={entry.info.id}
													onClick={() => navigateToSession(entry.info.id)}
													className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-all ${
														activeSessionId === entry.info.id
															? "bg-bg-surface text-text-primary border-r-2 border-accent"
															: "text-text-secondary hover:bg-bg-surface hover:text-text-primary"
													}`}
												>
													<span className="truncate flex-1">
														{entry.info.name || entry.info.id.slice(0, 8)}
													</span>
													{entry.streaming && (
														<span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
													)}
												</button>
											))}
										</div>
									)}
								</div>
							);
						})}
						{projects.length === 0 && (
							<div className="px-3 py-3 text-sm text-text-muted">
								Add a project to start a session.
							</div>
						)}
					</div>
				)}

				<div className="px-3 py-2">
					<div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
						{selectedProject ? "Sessions" : "Recent Sessions"}
					</div>
					<div className="flex flex-col gap-0.5">
						{visibleSessions.map((entry) => (
							<button
								key={entry.info.id}
								onClick={() => navigateToSession(entry.info.id)}
								className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-left transition-all ${
									activeSessionId === entry.info.id
										? "bg-bg-surface text-text-primary border-r-2 border-accent"
										: "text-text-secondary hover:bg-bg-surface hover:text-text-primary"
								}`}
							>
								<IconMessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-text-muted" />
								<span className="truncate flex-1">
									{entry.info.name || entry.info.id.slice(0, 8)}
								</span>
								{entry.streaming && (
									<span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse flex-shrink-0" />
								)}
							</button>
						))}
					</div>
					{visibleSessions.length === 0 && (
						<div className="px-3 py-3 text-sm text-text-muted">
							{selectedProject ? "No sessions in this project." : "No sessions yet."}
						</div>
					)}
				</div>
			</div>
		</aside>
	);
}
