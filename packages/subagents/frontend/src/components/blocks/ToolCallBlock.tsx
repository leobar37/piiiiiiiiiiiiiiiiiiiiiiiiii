import { useState, useCallback } from "react";

interface ToolCallBlockProps {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export function ToolCallBlock({ name, arguments: args }: ToolCallBlockProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const toggle = useCallback(() => setIsExpanded((v) => !v), []);

	return (
		<div className="my-3 bg-bg-elevated border border-border-subtle rounded-lg overflow-hidden">
			<button
				onClick={toggle}
				className="w-full flex items-center justify-between px-4 py-3 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer select-none"
			>
				<div className="flex items-center gap-2">
					<svg className="w-3.5 h-3.5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
				<span className="font-mono">{name}</span>
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
			<div className="px-4 pb-3">
				<pre className="text-xs text-text-secondary font-mono overflow-x-auto bg-bg-surface rounded-md px-3 py-2.5">
					{JSON.stringify(args, null, 2)}
				</pre>
			</div>
		)}
		</div>
	);
}
