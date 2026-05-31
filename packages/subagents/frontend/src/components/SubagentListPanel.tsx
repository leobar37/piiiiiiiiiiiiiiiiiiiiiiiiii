import { useMemo, useState } from "react";
import { navigateToThread } from "../navigation.ts";
import { useSubAgentStore } from "../store/use-subagent-store.ts";
import type { SubAgentInstanceState, SubAgentState } from "../types.ts";
import { StatusBadge } from "./StatusBadge.tsx";

type SubagentFilter = "all" | "running" | "failed" | "completed";

interface SubagentListPanelProps {
	activeThreadId: string | null;
	agentsOverride?: SubAgentInstanceState[];
}

const FILTERS: Array<{ id: SubagentFilter; label: string }> = [
	{ id: "all", label: "All" },
	{ id: "running", label: "Running" },
	{ id: "failed", label: "Failed" },
	{ id: "completed", label: "Completed" },
];

export function SubagentListPanel({ activeThreadId, agentsOverride }: SubagentListPanelProps) {
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [filter, setFilter] = useState<SubagentFilter>("all");
	const storeAgents = useSubAgentStore((s) => s.agents);
	const agents = agentsOverride ?? storeAgents;
	const groups = useMemo(() => groupSubagents(agents, filter), [agents, filter]);
	const total = useMemo(() => agents.filter((agent) => agent.kind === "subagent").length, [agents]);
	const visibleCount = groups.reduce((sum, group) => sum + group.threads.length, 0);

	const panel = (
		<aside
			className={`relative flex h-full shrink-0 flex-col border-r border-border-subtle bg-bg-elevated transition-[width] duration-200 ${
				collapsed ? "w-14" : "w-[280px]"
			}`}
		>
			<div className="flex min-h-12 items-center justify-between gap-2 border-b border-border-subtle px-3">
				{collapsed ? (
					<div className="flex w-full flex-col items-center gap-1">
						<div className="flex h-7 w-7 items-center justify-center rounded border border-border-subtle bg-bg text-text-secondary">
							<span className="text-sm leading-none">≡</span>
						</div>
						<div className="text-[10px] leading-none text-text-tertiary">{total}</div>
					</div>
				) : (
					<div className="min-w-0">
						<div className="text-sm font-medium text-text-primary">Subagents</div>
						<div className="text-xs text-text-tertiary">{total} total</div>
					</div>
				)}
				<button
					type="button"
					onClick={() => setCollapsed((value) => !value)}
					className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded border border-border-subtle text-xs text-text-secondary transition hover:border-border-hover hover:text-text-primary md:flex ${
						collapsed ? "absolute left-3 top-11 bg-bg-elevated" : ""
					}`}
					aria-label={collapsed ? "Expand subagent list" : "Collapse subagent list"}
				>
					{collapsed ? ">" : "<"}
				</button>
			</div>

			{collapsed ? null : (
				<>
					<div className="border-b border-border-subtle p-3">
						<div className="grid grid-cols-2 gap-1 rounded border border-border-subtle bg-bg p-1">
							{FILTERS.map((item) => (
								<button
									key={item.id}
									type="button"
									onClick={() => setFilter(item.id)}
									className={`rounded px-2 py-1 text-xs transition ${
										filter === item.id
											? "bg-bg-active text-text-primary"
											: "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
									}`}
								>
									{item.label}
								</button>
							))}
						</div>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto p-2">
						{visibleCount === 0 ? (
							<div className="px-3 py-6 text-center text-xs text-text-muted">No subagents yet</div>
						) : (
							<div className="space-y-3">
								{groups.map((group) => (
									<section key={group.runId} className="space-y-1">
										<div className="px-2 text-[11px] uppercase tracking-wide text-text-tertiary">
											{group.label}
										</div>
										{group.threads.map((thread) => (
											<SubagentListItem
												key={thread.instanceId}
												thread={thread}
												active={thread.instanceId === activeThreadId}
												onSelect={() => {
													navigateToThread(thread.instanceId);
													setMobileOpen(false);
												}}
											/>
										))}
									</section>
								))}
							</div>
						)}
					</div>
				</>
			)}
		</aside>
	);

	return (
		<>
			<div className="hidden h-full md:block">{panel}</div>
			<button
				type="button"
				onClick={() => setMobileOpen(true)}
				className="fixed left-3 top-3 z-40 rounded border border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary shadow-md md:hidden"
			>
				Subagents
			</button>
			{mobileOpen ? (
				<div className="fixed inset-0 z-50 flex md:hidden">
					<button
						type="button"
						className="flex-1 bg-black/50"
						aria-label="Close subagent list"
						onClick={() => setMobileOpen(false)}
					/>
					<div className="h-full">{panel}</div>
				</div>
			) : null}
		</>
	);
}

interface SubagentListItemProps {
	thread: SubAgentInstanceState;
	active: boolean;
	onSelect: () => void;
}

function SubagentListItem({ thread, active, onSelect }: SubagentListItemProps) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={`w-full rounded-md border px-3 py-2 text-left transition ${
				active
					? "border-accent bg-accent-muted"
					: "border-transparent bg-bg hover:border-border-subtle hover:bg-bg-hover"
			}`}
			aria-current={active ? "page" : undefined}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0 flex items-center gap-2">
					<StatusBadge state={thread.state} pulse={thread.state === "running"} />
				</div>
				<span className="shrink-0 text-[11px] text-text-tertiary">{thread.definitionName}</span>
			</div>
			<div className="mt-2 truncate text-sm font-medium text-text-primary">
				{thread.description || thread.definitionName}
			</div>
			<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
				<span>{thread.turnCount} turns</span>
				<span>{thread.toolCount} tools</span>
				{thread.startTime ? <span>{formatDuration(thread.durationMs)}</span> : null}
			</div>
			{thread.currentTool ? (
				<div className="mt-1 truncate text-xs text-accent">Running: {thread.currentTool}</div>
			) : null}
			{thread.error ? <div className="mt-1 truncate text-xs text-error">{thread.error}</div> : null}
		</button>
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
