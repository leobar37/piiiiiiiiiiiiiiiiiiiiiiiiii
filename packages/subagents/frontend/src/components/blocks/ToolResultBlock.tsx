interface ToolResultBlockProps {
	toolCallId: string;
	content: string;
	isError: boolean;
}

function tryFormatJson(content: string): string {
	try {
		const parsed = JSON.parse(content);
		return JSON.stringify(parsed, null, 2);
	} catch {
		return content;
	}
}

export function ToolResultBlock({ content, isError }: ToolResultBlockProps) {
	const formatted = tryFormatJson(content);

	return (
		<div className={`my-3 bg-bg-elevated border rounded-lg overflow-hidden ${isError ? "border-error/20" : "border-success/20"}`}>
			<div className={`flex items-center gap-2 px-4 py-3 text-sm ${isError ? "text-error" : "text-success"}`}>
				{isError ? (
					<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
					</svg>
				) : (
					<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
					</svg>
				)}
				<span className="font-medium">{isError ? "Error" : "Result"}</span>
			</div>
			<pre className="px-4 pb-3 text-xs text-text-secondary font-mono whitespace-pre-wrap overflow-x-auto max-h-60 overflow-y-auto leading-relaxed">
				{formatted}
			</pre>
		</div>
	);
}
