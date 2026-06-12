import { ExternalLink, PanelRight, PanelRightClose, Server } from "lucide-react";
import type { CanvasSession } from "../canvas/types.js";

interface SessionInspectorProps {
	session: CanvasSession | undefined;
	backendUrl: string;
	isOpen?: boolean;
	onToggle?: () => void;
	onClose: () => void;
}

export function SessionInspector({ session, backendUrl, isOpen = true, onToggle, onClose }: SessionInspectorProps) {
	if (!session) {
		return null;
	}

	if (!isOpen) {
		return (
			<div className="flex h-full w-11 shrink-0 flex-col items-center border-l border-border-subtle bg-bg-elevated py-3">
				<button
					type="button"
					onClick={onToggle}
					className="flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-secondary transition hover:border-border-hover hover:bg-bg-hover hover:text-text-primary"
					title="Open session inspector"
					aria-label="Open session inspector"
				>
					<PanelRight size={16} aria-hidden="true" />
				</button>
			</div>
		);
	}

	const threadId = session.threadId ?? session.id;
	const iframeUrl = `${backendUrl}/thread/${encodeURIComponent(threadId)}`;

	return (
		<aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border-subtle bg-bg-base">
			<div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-elevated px-4 py-3">
				<div className="min-w-0">
					<div className="truncate text-sm font-semibold text-text-primary">{session.name || `Session ${session.id.slice(0, 8)}`}</div>
					<div className="mt-0.5 truncate text-xs text-text-tertiary">{session.id}</div>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={onClose}
						className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
						title="Clear focus"
						aria-label="Clear focus"
					>
						<span className="text-xs">×</span>
					</button>
					<button
						type="button"
						onClick={onToggle}
						className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition hover:bg-bg-hover hover:text-text-primary"
						title="Close inspector"
						aria-label="Close inspector"
					>
						<PanelRightClose size={16} aria-hidden="true" />
					</button>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-4">
				<div className="space-y-4">
					<div>
						<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Embedded UI</div>
						<div className="rounded-lg border border-border-subtle bg-bg-elevated p-3">
							<div className="flex items-start gap-3">
								<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg-base text-accent-primary">
									<Server size={15} aria-hidden="true" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="text-sm font-medium text-text-primary">Subagents frontend</div>
									<div className="mt-1 break-all text-xs leading-relaxed text-text-tertiary">{iframeUrl}</div>
									<a
										href={iframeUrl}
										target="_blank"
										rel="noreferrer"
										className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1.5 text-xs font-medium text-text-secondary transition hover:border-accent-primary hover:text-text-primary"
									>
										<ExternalLink size={13} aria-hidden="true" />
										Open standalone
									</a>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</aside>
	);
}
