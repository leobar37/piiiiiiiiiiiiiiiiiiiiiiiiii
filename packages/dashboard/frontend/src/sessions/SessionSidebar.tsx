import { Bot, Folder, PanelLeft, PanelLeftClose, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import type { CanvasSession } from "../canvas/types.js";
import type { CanvasProject } from "../projects/types.js";

interface SessionSidebarProps {
	isOpen?: boolean;
	onToggle?: () => void;
	projects: CanvasProject[];
	sessions: CanvasSession[];
	visibleSessions: CanvasSession[];
	selectedProjectId: string | null;
	focusedSessionId: string | null;
	projectError: string | null;
	onSelectProject: (projectId: string | null) => void;
	onCreateProject: () => void;
	onFocusSession: (sessionId: string) => void;
	onCreateSession: () => void;
	canCreateSession: boolean;
	onRemoveSession: (sessionId: string) => void;
}

function shortPath(path: string): string {
	const normalized = path.replace(/\/+$/, "");
	const parts = normalized.split(/[\\/]/);
	if (parts.length <= 2) return normalized;
	return `${parts.at(-2)}/${parts.at(-1)}`;
}

export function SessionSidebar({
	isOpen = true,
	onToggle,
	projects,
	sessions,
	visibleSessions,
	selectedProjectId,
	focusedSessionId,
	projectError,
	onSelectProject,
	onCreateProject,
	onFocusSession,
	onCreateSession,
	canCreateSession,
	onRemoveSession,
}: SessionSidebarProps) {
	if (!isOpen) {
		return (
			<div className="flex h-full w-11 shrink-0 flex-col items-center border-r border-border-subtle bg-bg-elevated py-3">
				<button
					type="button"
					onClick={onToggle}
					className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-secondary transition hover:border-border-hover hover:bg-bg-hover hover:text-text-primary"
					title="Open sessions sidebar"
					aria-label="Open sessions sidebar"
				>
					<PanelLeft size={16} aria-hidden="true" />
				</button>
			</div>
		);
	}

	return (
		<aside className="flex h-full w-72 shrink-0 flex-col border-r border-border-subtle bg-bg-elevated">
			<div className="border-b border-border-subtle px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<div>
						<div className="text-sm font-semibold text-text-primary">Sessions</div>
						<div className="mt-0.5 text-xs text-text-tertiary">Projects and agent workspaces</div>
					</div>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={onCreateSession}
							disabled={!canCreateSession}
							className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-secondary transition hover:border-border-hover hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border-subtle disabled:hover:bg-transparent disabled:hover:text-text-secondary"
							title={canCreateSession ? "Add session" : "Select a project first"}
						>
							<Plus size={15} aria-hidden="true" />
						</button>
						<button
							type="button"
							onClick={onToggle}
							className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
							title="Close sessions sidebar"
							aria-label="Close sessions sidebar"
						>
							<PanelLeftClose size={16} aria-hidden="true" />
						</button>
					</div>
				</div>
			</div>

			<div className="border-b border-border-subtle px-3 py-3">
				<div className="mb-2 flex items-center justify-between">
					<div className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Projects</div>
					<button
						type="button"
						onClick={onCreateProject}
						className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
						title="Add project"
						aria-label="Add project"
					>
						<Plus size={14} aria-hidden="true" />
					</button>
				</div>

				<div className="space-y-1">
					<button
						type="button"
						onClick={() => onSelectProject(null)}
						className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${
							selectedProjectId === null
								? "border-accent/60 bg-accent-muted"
								: "border-transparent hover:border-border-subtle hover:bg-bg-hover"
						}`}
					>
						<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-surface text-accent">
							<Sparkles size={14} aria-hidden="true" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-medium text-text-primary">All projects</div>
							<div className="text-[11px] text-text-tertiary">{sessions.length} project session{sessions.length === 1 ? "" : "s"}</div>
						</div>
					</button>

					{projects.map((project) => {
						const selected = project.id === selectedProjectId;
						const count = sessions.filter((session) => session.projectId === project.id).length;
						return (
							<button
								key={project.id}
								type="button"
								onClick={() => onSelectProject(project.id)}
								className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${
									selected
										? "border-accent/60 bg-accent-muted"
										: "border-transparent hover:border-border-subtle hover:bg-bg-hover"
								}`}
							>
								<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-surface text-accent">
									<Folder size={14} aria-hidden="true" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium text-text-primary">{project.name}</div>
									<div className="truncate text-[11px] text-text-tertiary">
										{shortPath(project.defaultCwd)} - {count} session{count === 1 ? "" : "s"}
									</div>
								</div>
							</button>
						);
					})}
				</div>

				{projectError ? (
					<div className="mt-2 rounded-md border border-error/30 bg-error/10 px-2.5 py-2 text-xs text-error">{projectError}</div>
				) : null}
			</div>

			<div className="border-b border-border-subtle px-3 py-3">
				<div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg px-2.5 py-2 text-xs text-text-tertiary">
					<Search size={14} aria-hidden="true" />
					<span>Search coming soon</span>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
				{visibleSessions.length === 0 ? (
					<div className="px-3 py-8 text-center text-sm text-text-muted">No sessions created.</div>
				) : (
					<div className="space-y-1">
						{visibleSessions.map((session) => {
							const selected = session.id === focusedSessionId;
							return (
								<button
									key={session.id}
									type="button"
									onClick={() => onFocusSession(session.id)}
									className={`group w-full rounded-md border px-3 py-2.5 text-left transition ${
										selected
											? "border-accent/60 bg-accent-muted"
											: "border-transparent hover:border-border-subtle hover:bg-bg-hover"
									}`}
								>
									<div className="flex items-start gap-2.5">
										<div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-surface text-accent">
											<Bot size={14} aria-hidden="true" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm font-medium text-text-primary">{session.name || `Session ${session.id.slice(0, 8)}`}</div>
											<div className="mt-2 text-[11px] text-text-tertiary">
												{new Date(session.createdAt).toLocaleTimeString()}
											</div>
										</div>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onRemoveSession(session.id);
											}}
											className="opacity-0 group-hover:opacity-100 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition hover:bg-error/10 hover:text-error"
											title="Remove session"
										>
											<Trash2 size={13} aria-hidden="true" />
										</button>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</aside>
	);
}
