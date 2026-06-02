import type { LionChecklistSnapshot } from "../types.ts";
import { openChecklistDrawer } from "./ChecklistDrawer.tsx";

interface ChecklistProgressBlockProps {
	checklist: LionChecklistSnapshot;
}

export function ChecklistProgressBlock({ checklist }: ChecklistProgressBlockProps) {
	const progress = checklist.progress;
	return (
		<button
			type="button"
			onClick={() => openChecklistDrawer(checklist)}
			className="my-2 w-full rounded border border-border-default bg-bg-elevated px-3 py-2 text-left transition hover:border-border-hover hover:bg-bg-hover"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium text-text-primary">{checklist.slug}</div>
					<div className="mt-0.5 truncate text-xs text-text-muted">
						{checklist.kind} checklist · {progress.completed}/{progress.total} complete
					</div>
				</div>
				<div className="shrink-0 text-sm font-semibold text-text-primary">{progress.percent}%</div>
			</div>
			<div className="mt-2 h-1.5 overflow-hidden rounded bg-bg-surface">
				<div className="h-full bg-success" style={{ width: `${progress.percent}%` }} />
			</div>
		</button>
	);
}
