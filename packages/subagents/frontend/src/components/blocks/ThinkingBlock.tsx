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
			<div className="my-1 inline-flex max-w-full items-center gap-1.5 rounded border border-border-subtle bg-bg-surface/50 px-2 py-1 text-[11px] leading-4 text-text-muted">
				<Link className="h-3 w-3 shrink-0" aria-hidden="true" />
				Thinking content redacted
			</div>
		);
	}

	if (!thinking.trim()) return null;

	return (
		<div className="my-1 w-fit max-w-full overflow-hidden rounded border border-border-subtle bg-bg-surface/45">
			<button
				type="button"
				onClick={toggle}
				className={`flex max-w-full cursor-pointer select-none items-center gap-2 px-2 py-1 text-[11px] leading-4 text-text-muted transition-colors hover:text-text-secondary ${isStreaming ? "animate-pulse-opacity" : ""}`}
			>
				<Sparkles className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden="true" />
				<span className="font-medium">Thinking</span>
				{isStreaming && <span>...</span>}
				<ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
			</button>
			{isExpanded && (
				<div className="max-h-40 max-w-2xl overflow-auto border-t border-border-subtle px-2 py-1.5 font-mono text-[11px] leading-snug text-text-secondary whitespace-pre-wrap">
					{thinking}
				</div>
			)}
		</div>
	);
}
