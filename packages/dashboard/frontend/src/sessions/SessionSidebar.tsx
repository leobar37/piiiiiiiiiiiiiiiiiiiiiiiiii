import { Bot, PanelLeft, PanelLeftClose, Plus, Search, Trash2 } from "lucide-react";
import type { CanvasSession } from "../canvas/types.js";

interface SessionSidebarProps {
	isOpen?: boolean;
	onToggle?: () => void;
	sessions: CanvasSession[];
	focusedSessionId: string | null;
	onFocusSession: (sessionId: string) => void;
	onCreateSession: () => void;
	onRemoveSession: (sessionId: string) => void;
}

export function SessionSidebar({
	isOpen = true,
	onToggle,
	sessions,
	focusedSessionId,
	onFocusSession,
	onCreateSession,
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
						<div className="mt-0.5 text-xs text-text-tertiary">Focus agents on the canvas</div>
					</div>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={onCreateSession}
							className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-secondary transition hover:border-border-hover hover:bg-bg-hover hover:text-text-primary"
							title="Add session"
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
				<div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg px-2.5 py-2 text-xs text-text-tertiary">
					<Search size={14} aria-hidden="true" />
					<span>Search coming soon</span>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
				{sessions.length === 0 ? (
					<div className="px-3 py-8 text-center text-sm text-text-muted">No sessions created.</div>
				) : (
					<div className="space-y-1">
						{sessions.map((session) => {
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
