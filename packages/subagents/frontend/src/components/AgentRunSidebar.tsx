import { useLionChecklist } from "../hooks/use-lion-checklist.ts";
import { useLionState } from "../hooks/use-lion-state.ts";
import type { SubAgentInstanceState, SubAgentRunRecord } from "../types.ts";
import { useSubAgentStore } from "../store/use-subagent-store.ts";
import { MarkdownRenderer } from "./blocks/MarkdownRenderer";
import { ChecklistProgressBlock } from "./ChecklistProgressBlock.tsx";

interface AgentRunSidebarProps {
	agent?: SubAgentInstanceState;
	run?: SubAgentRunRecord;
	isLoading?: boolean;
}

function formatTime(value?: number | null): string {
	if (!value) return "n/a";
	return new Date(value).toLocaleString();
}

function CopyButton({ text, label }: { text: string; label: string }) {
	return (
		<button
			type="button"
			onClick={() => copyText(text)}
			disabled={!text.trim()}
			className="rounded border border-border-subtle px-2 py-1 text-xs text-text-secondary transition hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
		>
			{label}
		</button>
	);
}

async function copyText(text: string): Promise<void> {
	if (!text.trim()) return;
	try {
		await navigator.clipboard.writeText(text);
		return;
	} catch {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.left = "-9999px";
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand("copy");
		document.body.removeChild(textarea);
	}
}

export function AgentRunSidebar({ agent, run, isLoading }: AgentRunSidebarProps) {
	const { data: lionState } = useLionState();
	const activePlanReference = lionState?.activePlanPath ?? undefined;
	const agents = useSubAgentStore((state) => state.agents);
	const input = run?.prompt ?? "";
	const systemPrompt = run?.systemPrompt ?? "";
	const output = run?.summary ?? run?.error ?? "";
	const modelLabel =
		(run?.modelProvider && run.modelId ? `${run.modelProvider}/${run.modelId}` : null) ??
		(agent?.modelProvider && agent.modelId ? `${agent.modelProvider}/${agent.modelId}` : "n/a");
	const isMain = agent?.kind === "main";
	const { data: planChecklist } = useLionChecklist("plan", activePlanReference, {
		enabled: isMain && lionState?.strategy === "plan" && Boolean(activePlanReference),
		refetchInterval: 2000,
	});
	const runProgress = isMain && agent && lionState?.phase === "building" ? getRunProgress(agents, agent.instanceId) : null;

	return (
			<aside className="hidden w-[340px] shrink-0 flex-col border-l border-border-subtle bg-bg-elevated lg:flex">
			<div className="border-b border-border-subtle px-4 py-3">
				<div className="text-xs uppercase tracking-wide text-text-tertiary">Run</div>
				<div className="mt-1 truncate text-sm font-medium text-text-primary">{run?.description ?? agent?.description ?? agent?.definitionName ?? "Subagent"}</div>
				<div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-secondary">
					<div>
						<div className="text-text-tertiary">Model</div>
						<div className="truncate">{modelLabel}</div>
					</div>
					<div>
						<div className="text-text-tertiary">Status</div>
						<div>{run?.status ?? agent?.state ?? (isLoading ? "loading" : "n/a")}</div>
					</div>
					<div>
						<div className="text-text-tertiary">Turns</div>
						<div>{run?.turnCount ?? agent?.turnCount ?? 0}</div>
					</div>
					<div>
						<div className="text-text-tertiary">Tools</div>
						<div>{run?.toolCount ?? agent?.toolCount ?? 0}</div>
					</div>
				</div>
			</div>

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
				{isMain ? (
					<>
						{planChecklist ? (
							<section>
								<h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Plan Progress</h2>
								<ChecklistProgressBlock checklist={planChecklist} />
							</section>
						) : runProgress ? (
							<section>
								<h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Run Progress</h2>
								<RunProgressCard progress={runProgress} />
							</section>
						) : null}

						<section className="rounded border border-border-subtle bg-bg px-3 py-2 text-xs leading-relaxed text-text-secondary">
							<div className="text-text-tertiary">Session</div>
							<div className="mt-1 break-all text-text-primary">{agent?.sessionId ?? "n/a"}</div>
							<div className="mt-3 text-text-tertiary">Duration</div>
							<div className="mt-1 text-text-primary">{formatDuration(agent?.durationMs ?? 0)}</div>
						</section>
					</>
				) : (
					<>
						<section>
							<div className="mb-2 flex items-center justify-between gap-2">
								<h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Input</h2>
								<CopyButton text={input} label="Copy" />
							</div>
							<pre className="max-h-72 overflow-auto rounded border border-border-subtle bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">
								{input || "No run input recorded yet."}
							</pre>
						</section>

						{systemPrompt ? (
							<section>
								<div className="mb-2 flex items-center justify-between gap-2">
									<h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">System Prompt</h2>
									<CopyButton text={systemPrompt} label="Copy" />
								</div>
								<pre className="max-h-56 overflow-auto rounded border border-border-subtle bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">
									{systemPrompt}
								</pre>
							</section>
						) : null}

						<section>
							<div className="mb-2 flex items-center justify-between gap-2">
								<h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Output</h2>
								<CopyButton text={output} label="Copy" />
							</div>
							<div className="rounded border border-border-subtle bg-bg px-3 py-2">
								{output ? <MarkdownRenderer content={output} /> : <div className="text-xs text-text-muted">No output recorded yet.</div>}
							</div>
						</section>
					</>
				)}

				<div className="border-t border-border-subtle pt-3 text-xs text-text-tertiary">
					<div>Started: {formatTime(run?.startedAt ?? agent?.startTime)}</div>
					<div>Updated: {formatTime(run?.updatedAt ?? agent?.lastActivityAt)}</div>
					<div>Completed: {formatTime(run?.completedAt ?? agent?.endTime)}</div>
				</div>
			</div>
		</aside>
	);
}

interface RunProgress {
	runId: string;
	completed: number;
	failed: number;
	running: number;
	queued: number;
	total: number;
	percent: number;
}

function getRunProgress(agents: SubAgentInstanceState[], mainThreadId: string): RunProgress | null {
	const subagents = agents.filter((item) => item.kind === "subagent" && item.parentThreadId === mainThreadId && item.runId);
	if (subagents.length === 0) return null;

	const latestRunId = subagents.reduce((latest, item) => {
		const latestAgent = subagents.find((candidate) => candidate.runId === latest);
		if (!latestAgent) return item.runId ?? latest;
		return (item.startTime ?? 0) > (latestAgent.startTime ?? 0) ? item.runId ?? latest : latest;
	}, subagents[0]?.runId ?? "");

	const runAgents = subagents.filter((item) => item.runId === latestRunId);
	const completed = runAgents.filter((item) => item.state === "completed").length;
	const failed = runAgents.filter((item) => item.state === "failed" || item.state === "timed_out" || item.state === "cancelled").length;
	const queued = runAgents.filter((item) => item.state === "queued" || item.state === "created" || item.state === "starting").length;
	const running = runAgents.filter((item) => item.state === "running" || item.state === "completing" || item.state === "paused").length;
	const total = runAgents.length;
	const finished = completed + failed;
	const percent = total > 0 ? Math.round((finished / total) * 100) : 0;

	return { runId: latestRunId, completed, failed, running, queued, total, percent };
}

function RunProgressCard({ progress }: { progress: RunProgress }) {
	return (
		<div className="rounded border border-border-default bg-bg px-3 py-2">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-sm font-medium text-text-primary">{progress.runId}</div>
					<div className="mt-0.5 truncate text-xs text-text-muted">
						{progress.completed}/{progress.total} completed
					</div>
				</div>
				<div className="shrink-0 text-sm font-semibold text-text-primary">{progress.percent}%</div>
			</div>
			<div className="mt-2 h-1.5 overflow-hidden rounded bg-bg-surface">
				<div className="h-full bg-success" style={{ width: `${progress.percent}%` }} />
			</div>
			<div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-muted">
				<span>Running {progress.running}</span>
				<span>Queued {progress.queued}</span>
				<span>Failed {progress.failed}</span>
			</div>
		</div>
	);
}

function formatDuration(value: number): string {
	if (value <= 0) return "n/a";
	const seconds = Math.round(value / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
