import { useState } from "react";

interface HttpBlockProps {
	content: string;
}

interface ParsedHttp {
	method?: string;
	url?: string;
	status?: string;
	headers: Record<string, string>;
	body: string;
}

function parseHttp(content: string): ParsedHttp {
	const lines = content.trim().split("\n");
	const result: ParsedHttp = { headers: {}, body: "" };

	if (lines.length === 0) return result;

	const firstLine = lines[0].trim();
	if (firstLine.startsWith("HTTP/")) {
		const parts = firstLine.split(" ");
		result.status = parts.slice(1).join(" ");
	} else {
		const parts = firstLine.split(" ");
		if (parts.length >= 2) {
			result.method = parts[0];
			result.url = parts[1];
		}
	}

	let bodyStart = -1;
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i];
		if (line.trim() === "") {
			bodyStart = i + 1;
			break;
		}
		const colonIdx = line.indexOf(":");
		if (colonIdx > 0) {
			const key = line.slice(0, colonIdx).trim();
			const value = line.slice(colonIdx + 1).trim();
			result.headers[key] = value;
		}
	}

	if (bodyStart > 0) {
		result.body = lines.slice(bodyStart).join("\n").trim();
	}

	return result;
}

function tryFormatBody(body: string): string {
	try {
		const parsed = JSON.parse(body);
		return JSON.stringify(parsed, null, 2);
	} catch {
		return body;
	}
}

export function HttpBlock({ content }: HttpBlockProps) {
	const [showBody, setShowBody] = useState(true);
	const parsed = parseHttp(content);

	const isRequest = !!parsed.method;
	const methodColor =
		parsed.method === "GET"
			? "text-success"
			: parsed.method === "POST"
				? "text-accent"
				: parsed.method === "PUT" || parsed.method === "PATCH"
					? "text-warning"
					: parsed.method === "DELETE"
						? "text-error"
						: "text-text-primary";

	return (
		<div className="my-3 min-w-0 overflow-hidden rounded-lg border border-border-subtle">
			<div className="flex items-center gap-2 px-3 py-2 bg-bg-base border-b border-border-subtle">
				{isRequest ? (
					<>
						<span className={`text-xs font-mono font-semibold ${methodColor}`}>
							{parsed.method}
						</span>
						<span className="min-w-0 break-all font-mono text-xs text-text-secondary">{parsed.url}</span>
					</>
				) : (
					<span className="text-xs font-mono text-text-secondary">{parsed.status}</span>
				)}
			</div>

			{Object.keys(parsed.headers).length > 0 && (
				<div className="px-3 py-2 border-b border-border-subtle">
					{Object.entries(parsed.headers).map(([key, value]) => (
						<div key={key} className="text-[11px] font-mono">
							<span className="text-text-muted">{key}:</span>{" "}
							<span className="text-text-secondary">{value}</span>
						</div>
					))}
				</div>
			)}

			{parsed.body && (
				<div>
					<button
						onClick={() => setShowBody(!showBody)}
						className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
					>
						<span>Body</span>
						<svg
							className={`w-3 h-3 transition-transform ${showBody ? "rotate-180" : ""}`}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{showBody && (
						<pre className="overflow-x-hidden whitespace-pre-wrap break-words bg-bg-base px-3 py-2 font-mono text-xs text-text-primary">
							{tryFormatBody(parsed.body)}
						</pre>
					)}
				</div>
			)}
		</div>
	);
}
