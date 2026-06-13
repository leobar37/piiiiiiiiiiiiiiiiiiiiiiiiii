import { useState, useCallback, useMemo } from "react";
import { ChevronDown, Wrench } from "lucide-react";
import { SubagentRunBlock } from "../SubagentRunBlock.tsx";
import { useSubAgentStore } from "../../store/use-subagent-store.ts";

interface ToolCallBlockProps {
	id: string;
	name: string;
	args: Record<string, unknown>;
	currentThreadId: string;
}

export function ToolCallBlock({ id, name, args, currentThreadId }: ToolCallBlockProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const toggle = useCallback(() => setIsExpanded((v) => !v), []);
	const agents = useSubAgentStore((s) => s.agents);
	const strategy = typeof args.strategy === "string" ? args.strategy : "sequential";
	const childThreads = useMemo(
		() => agents.filter((agent) => agent.parentThreadId === currentThreadId && agent.parentToolCallId === id),
		[agents, currentThreadId, id],
	);

	if (name === "lion_tasks" && childThreads.length > 0) {
		return <SubagentRunBlock threads={childThreads} strategy={strategy} />;
	}

	return (
		<div className="my-0.5">
			<button
				type="button"
				onClick={toggle}
				className="inline-flex max-w-full items-center gap-1.5 py-0.5 text-[11px] leading-4 text-text-tertiary transition hover:text-text-secondary"
			>
				<Wrench className="h-3 w-3 shrink-0" aria-hidden="true" />
				<span className="truncate font-mono">{name}</span>
				<ChevronDown className={`h-3 w-3 shrink-0 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
			</button>
			{isExpanded && (
				<div className="mt-1 max-w-full pl-4">
					<pre className="max-h-32 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-text-secondary">
						{JSON.stringify(args, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}
