import type { LionDashboardState } from "../types.ts";

interface LionModeBadgeProps {
	state?: LionDashboardState;
}

const STRATEGY_LABELS: Record<LionDashboardState["strategy"], string> = {
	none: "Lion",
	simple: "Simple",
	review: "Review",
	plan: "Plan",
};

const PHASE_LABELS: Record<LionDashboardState["phase"], string> = {
	planning: "Planning",
	building: "Building",
};

export function formatLionModeLabel(state?: LionDashboardState): string | null {
	if (!state || !isLionUiActive(state)) return null;
	const { strategy, phase, activeTaskId, activePlanSlug } = state;
	if (strategy === "none") return null;
	const mode = STRATEGY_LABELS[strategy];
	const phaseLabel = PHASE_LABELS[phase];
	const detail = strategy === "simple" ? null : activeTaskId ?? activePlanSlug;
	return [mode, phaseLabel, detail].filter(Boolean).join(" · ");
}

export function isLionUiActive(state?: LionDashboardState): boolean {
	if (!state?.active) return false;
	if (state.strategy === "none") return false;
	if (state.strategy === "simple") return true;
	return Boolean(state.activePlanPath ?? state.activePlanSlug ?? state.activeTaskId ?? state.lastRunId);
}

export function LionModeBadge({ state }: LionModeBadgeProps) {
	const label = formatLionModeLabel(state);
	if (!label) return null;

	return (
		<span
			className="min-w-0 truncate rounded border border-border-subtle bg-bg px-2 py-1 text-xs text-text-secondary"
			title={label}
		>
			{label}
		</span>
	);
}
