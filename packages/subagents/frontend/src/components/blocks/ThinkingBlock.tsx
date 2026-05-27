import { useState, useCallback } from "react";

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
			<div className="my-3 px-4 py-3 bg-bg-elevated border border-border-subtle rounded-lg">
				<div className="flex items-center gap-2 text-xs text-text-muted italic">
					<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
					</svg>
					Thinking content redacted
				</div>
			</div>
		);
	}

	if (!thinking.trim()) return null;

	return (
		<div className="my-3 bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden">
			<button
				onClick={toggle}
				className={`w-full flex items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer select-none ${isStreaming ? "animate-pulse-opacity" : ""}`}
			>
				<div className="flex items-center gap-2">
					<svg className="w-3.5 h-3.5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
					</svg>
					<span className="font-medium">Thinking</span>
					{isStreaming && <span className="text-text-muted">...</span>}
				</div>
				<svg
					className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>
			{isExpanded && (
				<div className="px-4 pb-3 text-xs text-text-secondary whitespace-pre-wrap font-mono leading-relaxed">
					{thinking}
				</div>
			)}
		</div>
	);
}
