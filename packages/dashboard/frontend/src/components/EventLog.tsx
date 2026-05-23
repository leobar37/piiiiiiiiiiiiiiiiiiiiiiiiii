import { useMemo, useRef, useEffect, useState } from "react";
import { type DashboardEventPayload, useDashboardStore } from "../store/dashboard.js";

function getEventColor(type: string): string {
	if (type.startsWith("lion.build.")) return "text-blue-300";
	if (type.startsWith("lion.delegation.")) return "text-purple-300";
	if (type.startsWith("lion.task.")) return "text-green-300";
	if (type.startsWith("lion.review.")) return "text-orange-300";
	if (type.startsWith("lion.validation.")) return "text-yellow-300";
	if (type.startsWith("lion.rule.")) return "text-red-300";
	if (type.startsWith("task.")) return "text-cyan-300";
	if (type.startsWith("turn.")) return "text-gray-300";
	if (type.startsWith("tool.")) return "text-pink-300";
	return "text-gray-300";
}

function EventMetadata({ event }: { event: DashboardEventPayload }) {
	const badges = [
		event.planSlug ? `plan: ${event.planSlug}` : null,
		event.taskId ? `task: ${event.taskId}` : null,
		event.runId ? `run: ${event.runId.slice(0, 8)}` : null,
		event.attempt !== undefined ? `attempt: ${event.attempt}` : null,
	].filter((badge): badge is string => Boolean(badge));

	if (badges.length === 0) return null;
	return (
		<div className="mt-1 flex flex-wrap gap-1">
			{badges.map((badge) => (
				<span key={badge} className="rounded border border-gray-700 bg-gray-950 px-1.5 py-0.5 text-[10px] text-gray-400">
					{badge}
				</span>
			))}
		</div>
	);
}

function formatTimeAgo(timestamp: number): string {
	const diff = Date.now() - timestamp;
	if (diff < 1000) return "just now";
	if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	return `${Math.floor(diff / 3600000)}h ago`;
}

function formatTimestamp(timestamp: number): string {
	const d = new Date(timestamp);
	return d.toLocaleTimeString();
}

export function EventLog() {
	const events = useDashboardStore((s) => s.events);
	const sourceFilter = useDashboardStore((s) => s.sourceFilter);
	const typeFilter = useDashboardStore((s) => s.typeFilter);
	const clearEvents = useDashboardStore((s) => s.clearEvents);
	const setSourceFilter = useDashboardStore((s) => s.setSourceFilter);
	const setTypeFilter = useDashboardStore((s) => s.setTypeFilter);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const filteredEvents = useMemo(() => {
		return events.filter((e) => {
			if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
			if (typeFilter && !e.type.includes(typeFilter)) return false;
			return true;
		});
	}, [events, sourceFilter, typeFilter]);

	useEffect(() => {
		if (autoScroll && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [filteredEvents, autoScroll]);

	return (
		<div className="flex flex-col h-full">
			<div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-900 border-b border-gray-800">
				<div className="flex items-center gap-2">
					<span className="text-xs text-gray-500 uppercase tracking-wider">Source</span>
					<select
						value={sourceFilter}
						onChange={(e) => setSourceFilter(e.target.value as "all" | "lion" | "subagent")}
						className="bg-gray-800 text-gray-200 text-sm rounded px-2 py-1 border border-gray-700"
					>
						<option value="all">All</option>
						<option value="lion">Lion</option>
						<option value="subagent">SubAgent</option>
					</select>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-gray-500 uppercase tracking-wider">Type</span>
					<input
						type="text"
						value={typeFilter ?? ""}
						onChange={(e) => setTypeFilter(e.target.value || null)}
						placeholder="Filter..."
						className="bg-gray-800 text-gray-200 text-sm rounded px-2 py-1 border border-gray-700 w-40"
					/>
				</div>
				<div className="flex items-center gap-2 ml-auto">
					<label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
						<input
							type="checkbox"
							checked={autoScroll}
							onChange={(e) => setAutoScroll(e.target.checked)}
							className="rounded"
						/>
						Auto-scroll
					</label>
					<button
						onClick={clearEvents}
						className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded border border-gray-700"
					>
						Clear
					</button>
				</div>
				<div className="text-xs text-gray-500">{filteredEvents.length} events</div>
			</div>
			<div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1">
				{filteredEvents.length === 0 && (
					<div className="text-gray-500 text-sm text-center py-8">No events yet</div>
				)}
				{filteredEvents.map((event) => (
					<div
						key={event.id}
						className="flex items-start gap-2 p-2 rounded bg-gray-900 hover:bg-gray-800 cursor-pointer"
						onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
					>
						<span
							className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mt-0.5 ${
								event.source === "lion"
									? "bg-blue-900/50 text-blue-300"
									: "bg-green-900/50 text-green-300"
							}`}
						>
							{event.source}
						</span>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className={`text-xs font-mono ${getEventColor(event.type)}`}>{event.type}</span>
								<span className="text-[10px] text-gray-500" title={formatTimestamp(event.timestamp)}>
									{formatTimeAgo(event.timestamp)}
								</span>
							</div>
							<EventMetadata event={event} />
							{expandedId === event.id && (
								<pre className="text-[11px] text-gray-400 mt-1 overflow-x-auto bg-gray-950 p-2 rounded">
									{JSON.stringify(event.payload, null, 2)}
								</pre>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
