import type { SubAgentState } from "../types.ts";

const STATE_CONFIG: Record<
	SubAgentState,
	{ label: string; color: string; bg: string }
> = {
	created: { label: "Created", color: "text-text-muted", bg: "bg-bg-surface" },
	starting: { label: "Starting", color: "text-info", bg: "bg-accent-muted" },
	running: { label: "Running", color: "text-accent", bg: "bg-accent-muted" },
	paused: { label: "Paused", color: "text-warning", bg: "bg-bg-surface" },
	completing: { label: "Completing", color: "text-info", bg: "bg-accent-muted" },
	completed: { label: "Completed", color: "text-success", bg: "bg-bg-surface" },
	failed: { label: "Failed", color: "text-error", bg: "bg-bg-surface" },
	cancelled: { label: "Cancelled", color: "text-text-muted", bg: "bg-bg-surface" },
	timed_out: { label: "Timed Out", color: "text-error", bg: "bg-bg-surface" },
	queued: { label: "Queued", color: "text-text-muted", bg: "bg-bg-surface" },
};

interface StatusBadgeProps {
	state: SubAgentState;
	pulse?: boolean;
}

export function StatusBadge({ state, pulse }: StatusBadgeProps) {
	const cfg = STATE_CONFIG[state] ?? STATE_CONFIG.created;
	return (
		<span
			className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg} ${pulse ? "animate-pulse-opacity" : ""}`}
		>
			<span className={`w-1.5 h-1.5 rounded-full ${state === "running" ? "bg-accent" : state === "completed" ? "bg-success" : state === "failed" || state === "timed_out" ? "bg-error" : "bg-text-muted"}`} />
			{cfg.label}
		</span>
	);
}
