import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Transition } from "framer-motion";
import { Activity, AlertCircle, CheckCircle2, Clock3, ListFilter, Loader2, Timer, Users, Wrench, X } from "lucide-react";
import { navigateToThread } from "../navigation.ts";
import { useSubAgentStore } from "../store/use-subagent-store.ts";
import type { SubAgentInstanceState, SubAgentState } from "../types.ts";

type SubagentFilter = "all" | "running" | "failed" | "completed";

interface SubagentListPanelProps {
	activeThreadId: string | null;
	agentsOverride?: SubAgentInstanceState[];
	initiallyOpen?: boolean;
}

const FILTERS: Array<{ id: SubagentFilter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "running", label: "Running" },
	{ id: "failed", label: "Failed" },
	{ id: "completed", label: "Completed" },
];

const panelMotion = {
	hidden: { x: -28, opacity: 0 },
	visible: { x: 0, opacity: 1 },
	exit: { x: -18, opacity: 0 },
};

const listMotion = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.035,
			delayChildren: 0.04,
		},
	},
};

const itemMotion = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0 },
};

const quickEase = [0.22, 1, 0.36, 1] as const;

export function SubagentListPanel({ activeThreadId, agentsOverride, initiallyOpen = false }: SubagentListPanelProps) {
	const [open, setOpen] = useState(initiallyOpen);
	const [filter, setFilter] = useState<SubagentFilter>("all");
	const reduceMotion = useReducedMotion();
	const storeAgents = useSubAgentStore((s) => s.agents);
	const agents = agentsOverride ?? storeAgents;
	const groups = useMemo(() => groupSubagents(agents, filter), [agents, filter]);
	const total = useMemo(() => agents.filter((agent) => agent.kind === "subagent").length, [agents]);
	const counts = useMemo(() => countSubagents(agents), [agents]);
	const visibleCount = groups.reduce((sum, group) => sum + group.threads.length, 0);
	const motionTransition: Transition = reduceMotion ? { duration: 0 } : { duration: 0.18, ease: quickEase };

	if (total === 0) return null;

	const panel = (
		<motion.aside
			variants={panelMotion}
			initial={reduceMotion ? false : "hidden"}
			animate="visible"
			exit="exit"
			transition={motionTransition}
			className="flex h-full w-[340px] max-w-[calc(100vw-1.25rem)] shrink-0 flex-col border-r border-border-default bg-bg-elevated shadow-2xl"
		>
			<div className="border-b border-border-subtle px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-muted text-accent">
								<Users size={15} aria-hidden="true" />
							</div>
							<div className="text-sm font-semibold text-text-primary">Subagents</div>
						</div>
						<div className="mt-1 text-xs text-text-tertiary">
							{counts.running} running · {counts.completed} completed · {counts.failed} failed
						</div>
					</div>
					<button
						type="button"
						onClick={() => setOpen(false)}
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-subtle text-text-secondary transition hover:border-border-hover hover:bg-bg-hover hover:text-text-primary"
						aria-label="Close subagent widget"
					>
						<X size={16} aria-hidden="true" />
					</button>
				</div>
			</div>

			<div className="border-b border-border-subtle px-4 py-3">
				<div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
					<ListFilter size={12} aria-hidden="true" />
					Filter
				</div>
				<div className="grid grid-cols-2 gap-1.5">
					{FILTERS.map((item) => {
						const count = counts[item.id];
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => setFilter(item.id)}
								className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs transition duration-150 active:scale-[0.98] ${
									filter === item.id
										? "border-accent/60 bg-accent-muted text-text-primary"
										: "border-border-subtle bg-bg text-text-secondary hover:border-border-hover hover:bg-bg-hover hover:text-text-primary"
								}`}
							>
								<span>{item.label}</span>
								<span className="rounded bg-bg-surface px-1.5 py-0.5 text-[11px] text-text-tertiary">{count}</span>
							</button>
						);
					})}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
				{visibleCount === 0 ? (
					<EmptyFilterState filter={filter} />
				) : (
					<motion.div variants={listMotion} initial={reduceMotion ? false : "hidden"} animate="visible" className="space-y-4">
						{groups.map((group) => (
							<motion.section key={group.runId} variants={itemMotion} className="space-y-2">
								<RunGroupHeader group={group} />
								{group.threads.map((thread) => (
									<SubagentListItem
										key={thread.instanceId}
										thread={thread}
										active={thread.instanceId === activeThreadId}
										reduceMotion={reduceMotion}
										onSelect={() => {
											navigateToThread(thread.instanceId);
											setOpen(false);
										}}
									/>
								))}
							</motion.section>
						))}
					</motion.div>
				)}
			</div>
		</motion.aside>
	);

	return (
		<>
			<div className="relative z-30 flex h-full w-11 shrink-0 items-start justify-center border-r border-border-subtle bg-bg-elevated pt-16">
				<button
					type="button"
					onClick={() => setOpen(true)}
					className="group relative flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle bg-bg text-text-secondary transition duration-150 hover:border-border-hover hover:bg-bg-hover hover:text-text-primary active:scale-95"
					aria-label="Open subagent widget"
					aria-expanded={open}
				>
					<Users size={15} aria-hidden="true" />
					<span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded bg-bg-surface px-1 text-[10px] font-medium text-text-secondary ring-1 ring-border-subtle">
						{total}
					</span>
					{counts.running > 0 ? (
						<span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-bg-elevated" />
					) : null}
				</button>
			</div>
			<AnimatePresence>
				{open ? (
					<motion.div className="fixed inset-0 z-50 flex" initial={reduceMotion ? false : "hidden"} animate="visible" exit="exit">
						{panel}
						<motion.button
							type="button"
							className="flex-1 bg-black/45"
							aria-label="Close subagent widget"
							onClick={() => setOpen(false)}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: reduceMotion ? 0 : 0.14 }}
						/>
					</motion.div>
				) : null}
			</AnimatePresence>
		</>
	);
}

interface SubagentListItemProps {
	thread: SubAgentInstanceState;
	active: boolean;
	reduceMotion: boolean | null;
	onSelect: () => void;
}

function SubagentListItem({ thread, active, reduceMotion, onSelect }: SubagentListItemProps) {
	const status = getStatusConfig(thread.state);
	const title = thread.description || thread.definitionName;
	return (
		<motion.button
			type="button"
			onClick={onSelect}
			layout
			whileHover={reduceMotion ? undefined : { y: -1 }}
			whileTap={reduceMotion ? undefined : { scale: 0.99 }}
			transition={{ duration: reduceMotion ? 0 : 0.14, ease: quickEase }}
			className={`group w-full rounded-md border px-3 py-3 text-left transition-colors duration-150 ${
				active
					? "border-accent/70 bg-accent-muted shadow-sm"
					: "border-border-subtle bg-bg/80 hover:border-border-hover hover:bg-bg-hover"
			}`}
			aria-current={active ? "page" : undefined}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${status.bg} ${status.color}`}>
							<status.icon size={14} aria-hidden="true" />
						</span>
						<span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
					</div>
					<div className="mt-2 truncate text-sm font-semibold text-text-primary" title={title}>
						{title}
					</div>
				</div>
				<span className="shrink-0 rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-tertiary">
					{thread.definitionName}
				</span>
			</div>

			<div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-text-muted">
				<Metric icon={Activity} label={`${thread.turnCount} turns`} />
				<Metric icon={Wrench} label={`${thread.toolCount} tools`} />
				<Metric icon={Timer} label={thread.startTime ? formatDuration(thread.durationMs) : "queued"} />
			</div>

			{thread.currentTool ? (
				<div className="mt-3 flex items-center gap-2 rounded-md border border-accent/20 bg-accent-muted px-2 py-1.5 text-xs text-accent">
					<Loader2 size={13} className="animate-spin" aria-hidden="true" />
					<span className="truncate">Using {thread.currentTool}</span>
				</div>
			) : null}
			{thread.error ? (
				<div className="mt-3 truncate rounded-md border border-error/25 bg-bg-surface px-2 py-1.5 text-xs text-error" title={thread.error}>
					{thread.error}
				</div>
			) : null}
		</motion.button>
	);
}

function RunGroupHeader({ group }: { group: SubagentGroup }) {
	return (
		<div className="flex items-center justify-between gap-3 px-1">
			<div className="min-w-0">
				<div className="truncate text-[11px] font-medium uppercase tracking-wide text-text-tertiary" title={group.runId}>
					{formatRunLabel(group)}
				</div>
			</div>
			<span className="shrink-0 rounded bg-bg-surface px-1.5 py-0.5 text-[11px] text-text-tertiary">
				{group.threads.length}
			</span>
		</div>
	);
}

function EmptyFilterState({ filter }: { filter: SubagentFilter }) {
	return (
		<div className="rounded-md border border-border-subtle bg-bg px-4 py-8 text-center">
			<div className="mx-auto flex h-9 w-9 items-center justify-center rounded-md bg-bg-surface text-text-tertiary">
				<ListFilter size={16} aria-hidden="true" />
			</div>
			<div className="mt-3 text-sm font-medium text-text-primary">No {filter} subagents</div>
			<div className="mt-1 text-xs text-text-muted">Try another filter.</div>
		</div>
	);
}

function Metric({ icon: Icon, label }: { icon: typeof Activity; label: string }) {
	return (
		<div className="flex min-w-0 items-center gap-1.5 rounded-md bg-bg-surface px-2 py-1.5">
			<Icon size={12} className="shrink-0 text-text-tertiary" aria-hidden="true" />
			<span className="truncate">{label}</span>
		</div>
	);
}

interface SubagentGroup {
	runId: string;
	label: string;
	threads: SubAgentInstanceState[];
	lastActivityAt: number;
}

export function groupSubagents(agents: SubAgentInstanceState[], filter: SubagentFilter): SubagentGroup[] {
	const subagents = agents
		.filter((agent) => agent.kind === "subagent")
		.filter((agent) => matchesFilter(agent.state, filter));
	const groups = new Map<string, SubagentGroup>();

	for (const thread of subagents) {
		const runId = thread.runId ?? "ungrouped";
		const current = groups.get(runId) ?? {
			runId,
			label: runId === "ungrouped" ? "Ungrouped" : `Run ${runId}`,
			threads: [],
			lastActivityAt: 0,
		};
		current.threads.push(thread);
		current.lastActivityAt = Math.max(current.lastActivityAt, thread.lastActivityAt);
		groups.set(runId, current);
	}

	return Array.from(groups.values())
		.map((group) => ({
			...group,
			threads: group.threads.sort(
				(a, b) => (a.runIndex ?? Number.MAX_SAFE_INTEGER) - (b.runIndex ?? Number.MAX_SAFE_INTEGER)
					|| b.lastActivityAt - a.lastActivityAt,
			),
		}))
		.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

function countSubagents(agents: SubAgentInstanceState[]): Record<SubagentFilter, number> {
	const subagents = agents.filter((agent) => agent.kind === "subagent");
	return {
		all: subagents.length,
		running: subagents.filter((agent) => matchesFilter(agent.state, "running")).length,
		failed: subagents.filter((agent) => matchesFilter(agent.state, "failed")).length,
		completed: subagents.filter((agent) => matchesFilter(agent.state, "completed")).length,
	};
}

function getStatusConfig(state: SubAgentState): { label: string; color: string; bg: string; icon: typeof Activity } {
	if (state === "running" || state === "starting" || state === "queued" || state === "completing") {
		return { label: "Running", color: "text-accent", bg: "bg-accent-muted", icon: Loader2 };
	}
	if (state === "completed") {
		return { label: "Completed", color: "text-success", bg: "bg-success/10", icon: CheckCircle2 };
	}
	if (state === "failed" || state === "timed_out" || state === "cancelled") {
		return { label: "Failed", color: "text-error", bg: "bg-error/10", icon: AlertCircle };
	}
	if (state === "blocked" || state === "paused") {
		return { label: state === "blocked" ? "Blocked" : "Paused", color: "text-warning", bg: "bg-warning/10", icon: Clock3 };
	}
	return { label: "Created", color: "text-text-muted", bg: "bg-bg-surface", icon: Clock3 };
}

function formatRunLabel(group: SubagentGroup): string {
	if (group.runId === "ungrouped") return "Ungrouped";
	const suffix = group.runId.split("-").slice(-1)[0] ?? group.runId;
	return `Run ${suffix}`;
}

function matchesFilter(state: SubAgentState, filter: SubagentFilter): boolean {
	if (filter === "all") return true;
	if (filter === "running") return state === "running" || state === "starting" || state === "queued";
	if (filter === "failed") return state === "failed" || state === "timed_out";
	return state === "completed";
}

function formatDuration(value: number): string {
	if (value <= 0) return "0s";
	const seconds = Math.round(value / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
