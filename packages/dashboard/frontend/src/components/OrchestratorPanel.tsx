import { useDashboardStore } from "../store/dashboard.js";

function statusClass(status: string): string {
	if (status === "running" || status === "executing") return "bg-green-900/40 text-green-300 border-green-800";
	if (status === "completed" || status === "approved") return "bg-blue-900/40 text-blue-300 border-blue-800";
	if (status === "failed" || status === "rejected") return "bg-red-900/40 text-red-300 border-red-800";
	return "bg-gray-800 text-gray-300 border-gray-700";
}

function shortId(id: string | null): string {
	return id ? id.slice(0, 8) : "none";
}

export function OrchestratorPanel() {
	const lion = useDashboardStore((s) => s.lionState);

	if (!lion?.activePlan && !lion?.activeRun) {
		return (
			<section className="border-b border-gray-800 bg-gray-950 px-4 py-3">
				<div className="text-xs uppercase tracking-wider text-gray-500">Orchestrator</div>
				<div className="mt-2 rounded-lg border border-dashed border-gray-800 bg-gray-900/40 p-3 text-sm text-gray-500">
					No active Lion plan.
				</div>
			</section>
		);
	}

	return (
		<section className="border-b border-gray-800 bg-gray-950 px-4 py-3">
			<div className="flex flex-wrap items-center gap-2">
				<div className="text-xs uppercase tracking-wider text-gray-500">Orchestrator</div>
				{lion.mode && <span className="rounded border border-gray-700 bg-gray-900 px-2 py-0.5 text-xs text-gray-300">{lion.mode}</span>}
			</div>

			<div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
				<div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
					<div className="text-xs text-gray-500">Plan</div>
					<div className="mt-1 font-mono text-sm text-gray-100">{lion.activePlan?.slug ?? "none"}</div>
					<div className="mt-2 text-xs text-gray-500 truncate">{lion.activePlan?.path ?? "No path"}</div>
					<div className="mt-3 flex flex-wrap gap-2 text-xs">
						<span className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-gray-300">
							Task: {lion.activeTask?.id ?? "none"}
						</span>
						<span className={`rounded border px-2 py-1 ${statusClass(lion.activeTask?.status ?? "idle")}`}>
							{lion.activeTask?.status ?? "idle"}
						</span>
					</div>
					{lion.activeTask?.title && <div className="mt-2 text-sm text-gray-300">{lion.activeTask.title}</div>}
				</div>

				<div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
					<div className="text-xs text-gray-500">Run</div>
					<div className="mt-1 flex flex-wrap items-center gap-2">
						<span className="font-mono text-sm text-gray-100">{shortId(lion.activeRun?.runId ?? null)}</span>
						<span className={`rounded border px-2 py-1 text-xs ${statusClass(lion.activeRun?.status ?? "idle")}`}>
							{lion.activeRun?.status ?? "idle"}
						</span>
						<span className="rounded border border-gray-700 bg-gray-950 px-2 py-1 text-xs text-gray-300">
							attempt {lion.activeRun?.attempt ?? 0}
						</span>
					</div>
					<div className="mt-3 text-xs text-gray-500">Sub-agents ({lion.subagents.length})</div>
					<div className="mt-2 space-y-2">
						{lion.subagents.slice(0, 4).map((subagent) => (
							<div key={subagent.taskId} className="rounded border border-gray-800 bg-gray-950 p-2">
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<span className="font-mono text-gray-200">{subagent.role}</span>
									<span className={`rounded border px-1.5 py-0.5 ${statusClass(subagent.status)}`}>{subagent.status}</span>
									<span className="text-gray-500">turn {subagent.turnCount}</span>
									{subagent.currentTool && <span className="text-pink-300">tool: {subagent.currentTool}</span>}
								</div>
								{subagent.summary && <div className="mt-1 truncate text-xs text-gray-500">{subagent.summary}</div>}
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
