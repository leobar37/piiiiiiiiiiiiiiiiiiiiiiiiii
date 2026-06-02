import type { LionDashboardState } from "../types.ts";

interface LionModeBadgeProps {
	state?: LionDashboardState;
}

export function formatLionModeLabel(state?: LionDashboardState): string {
	if (!state?.active) return "Lion inactive";
	const mode = state.strategy === "simple" ? "Simple mode" : state.strategy === "review" ? "Review mode" : "Plan mode";
	const phase = state.phase === "building" ? "Building" : "Planning";
	const detail = state.strategy === "simple" ? null : state.activeTaskId ?? state.activePlanSlug;
	return [mode, phase, detail].filter(Boolean).join(" · ");
}

export function LionModeBadge({ state }: LionModeBadgeProps) {
	const label = formatLionModeLabel(state);
	return (
		<span
			className="min-w-0 truncate rounded border border-border-subtle bg-bg px-2 py-1 text-xs text-text-secondary"
			title={label}
		>
			{label}
		</span>
	);
}
