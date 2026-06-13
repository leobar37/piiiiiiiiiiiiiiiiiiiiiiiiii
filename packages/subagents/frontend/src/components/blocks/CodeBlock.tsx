import { useState, useCallback } from "react";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);

interface CodeBlockProps {
	code: string;
	language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
	const [copied, setCopied] = useState(false);
	const normalizedLanguage = language?.toLowerCase();

	const highlighted = normalizedLanguage && hljs.getLanguage(normalizedLanguage)
		? hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true }).value
		: hljs.highlightAuto(code).value;

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [code]);

	return (
		<div className="relative group my-3 min-w-0 overflow-x-hidden">
			<div className="flex items-center justify-between px-3 py-1.5 bg-bg-base border-b border-border-subtle rounded-t-lg">
				<span className="text-[10px] uppercase tracking-wider text-text-muted font-mono">
					{language || "text"}
				</span>
				<button
					onClick={handleCopy}
					className="text-[10px] text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
				>
					{copied ? (
						<>
							<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
							Copied
						</>
					) : (
						<>
							<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
								/>
							</svg>
							Copy
						</>
					)}
				</button>
			</div>
			<pre className="overflow-x-hidden whitespace-pre-wrap break-words rounded-b-lg border border-t-0 border-border-subtle bg-bg-base p-3">
				<code
					className="break-words font-mono text-xs text-text-primary"
					dangerouslySetInnerHTML={{ __html: highlighted }}
				/>
			</pre>
		</div>
	);
}
