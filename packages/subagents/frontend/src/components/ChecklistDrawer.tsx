import type { LionChecklistSnapshot, LionTaskStatus } from "../types.ts";
import { checklistKey, useSubAgentStore } from "../store/use-subagent-store.ts";

const STATUS_LABELS: Record<LionTaskStatus, string> = {
	pending: "Pending",
	in_progress: "In progress",
	complete: "Complete",
	blocked: "Blocked",
	retryable: "Retryable",
};

export function ChecklistDrawer() {
	const openKey = useSubAgentStore((state) => state.openChecklistKey);
	const checklist = useSubAgentStore((state) => (openKey ? state.checklistsByKey[openKey] : undefined));
	const openChecklist = useSubAgentStore((state) => state.openChecklist);

	if (!openKey || !checklist) return null;

	return (
		<div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={() => openChecklist(null)}>
			<div
				className="flex h-full w-full max-w-lg flex-col border-l border-border-default bg-bg-base shadow-xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="shrink-0 flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-3">
					<div className="min-w-0">
						<div className="text-sm font-semibold text-text-primary">Checklist progress</div>
						<div className="mt-1 truncate text-xs text-text-muted">{checklist.rootPath}</div>
					</div>
					<button
						type="button"
						onClick={() => openChecklist(null)}
						className="flex h-7 w-7 items-center justify-center rounded border border-border-subtle text-text-muted hover:text-text-primary"
						aria-label="Close checklist drawer"
					>
						<svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
				<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
					<ChecklistSummary checklist={checklist} />
					<div className="space-y-2">
						{checklist.tasks.map((task) => (
							<div key={task.id} className="rounded border border-border-subtle bg-bg-elevated px-3 py-2">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="truncate text-sm font-medium text-text-primary">
											{task.id} {task.title}
										</div>
										{task.file ? <div className="mt-0.5 truncate text-xs text-text-muted">{task.file}</div> : null}
									</div>
									<span className="shrink-0 rounded border border-border-subtle bg-bg px-2 py-0.5 text-[11px] text-text-secondary">
										{STATUS_LABELS[task.status]}
									</span>
								</div>
								{task.last_summary ? (
									<div className="mt-1.5 overflow-hidden text-xs leading-snug text-text-secondary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
										{task.last_summary}
									</div>
								) : null}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export function openChecklistDrawer(checklist: LionChecklistSnapshot): void {
	const store = useSubAgentStore.getState();
	store.upsertChecklist(checklist);
	store.openChecklist(checklistKey(checklist));
}

function ChecklistSummary({ checklist }: { checklist: LionChecklistSnapshot }) {
	const progress = checklist.progress;
	return (
		<div className="rounded border border-border-default bg-bg-elevated px-3 py-2.5">
			<div className="flex items-center justify-between gap-4">
				<div>
					<div className="text-sm font-medium text-text-primary">{checklist.slug}</div>
					<div className="mt-0.5 text-xs text-text-muted">{checklist.kind}</div>
				</div>
				<div className="text-right">
					<div className="text-lg font-semibold text-text-primary">{progress.percent}%</div>
					<div className="text-xs text-text-muted">{progress.completed}/{progress.total} complete</div>
				</div>
			</div>
			<div className="mt-2 h-1.5 overflow-hidden rounded bg-bg-surface">
				<div className="h-full bg-success" style={{ width: `${progress.percent}%` }} />
			</div>
			<div className="mt-2 flex flex-wrap gap-2 text-[11px] text-text-muted">
				<span>Pending {progress.pending}</span>
				<span>Running {progress.inProgress}</span>
				<span>Blocked {progress.blocked}</span>
				<span>Retryable {progress.retryable}</span>
			</div>
		</div>
	);
}
