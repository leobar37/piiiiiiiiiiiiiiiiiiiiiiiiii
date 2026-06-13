import { useState, useCallback } from "react";
import { ChevronDown, Link, Sparkles } from "lucide-react";

interface ThinkingBlockProps {
	thinking: string;
	signature?: string;
	redacted?: boolean;
	isStreaming?: boolean;
}

export function ThinkingBlock({ thinking, redacted, isStreaming }: ThinkingBlockProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const toggle = useCallback(() => setIsExpanded((v) => !v), []);

	if (redacted) {
		return (
			<div className="my-0.5 inline-flex max-w-full items-center gap-1.5 text-[11px] leading-4 text-text-muted">
				<Link className="h-3 w-3 shrink-0" aria-hidden="true" />
				Thinking content redacted
			</div>
		);
	}

	if (!thinking.trim()) return null;

	return (
		<div className="my-0.5 w-fit max-w-full">
			<button
				type="button"
				onClick={toggle}
				className={`flex max-w-full cursor-pointer select-none items-center gap-1.5 py-0.5 text-[11px] leading-4 text-text-muted transition-colors hover:text-text-secondary ${isStreaming ? "animate-pulse-opacity" : ""}`}
			>
				<Sparkles className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden="true" />
				<span className="font-medium">Thinking</span>
				{isStreaming && <span>...</span>}
				<ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
			</button>
			{isExpanded && (
				<div className="max-h-40 max-w-2xl overflow-y-auto overflow-x-hidden break-words pl-4 pt-1 font-mono text-[11px] leading-snug text-text-secondary whitespace-pre-wrap">
					{thinking}
				</div>
			)}
		</div>
	);
}
