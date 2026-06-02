import { MarkdownRenderer } from "./MarkdownRenderer";
import { useState } from "react";
import { ChecklistProgressBlock } from "../ChecklistProgressBlock.tsx";
import type { LionChecklistSnapshot } from "../../types.ts";

interface ToolResultBlockProps {
	toolCallId: string;
	toolName?: string;
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

function isJson(content: string): boolean {
	try {
		JSON.parse(content);
		return true;
	} catch {
		return false;
	}
}

function isPlainOutput(content: string): boolean {
	const lines = content.split("\n");
	return lines.some((line) => line.startsWith("$ ") || line.includes("Error:") || line.includes(" at "));
}

export function ToolResultBlock({ toolName, content, isError }: ToolResultBlockProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const checklist = parseChecklistResult(toolName, content);
	if (!isError && checklist) return <ChecklistProgressBlock checklist={checklist} />;

	const formatted = tryFormatJson(content);
	const renderAsPre = isError || isJson(content) || isPlainOutput(content);
	const summary = summarizeToolResult(content, isError);

	return (
		<div className="my-0.5">
			<button
				type="button"
				onClick={() => setIsExpanded((value) => !value)}
				className={`inline-flex max-w-full items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] leading-4 transition ${
					isError
						? "border-error/30 bg-bg text-error hover:border-error/50"
						: "border-success/20 bg-bg text-success hover:border-success/40"
				}`}
			>
				{isError ? (
					<svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
					</svg>
				) : (
					<svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
					</svg>
				)}
				<span className="shrink-0 font-medium">{isError ? "Error" : "Result"}</span>
				<span className="truncate text-text-secondary">{summary}</span>
				<svg
					className={`h-3 w-3 shrink-0 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>
			{isExpanded ? (
				<div className={`mt-1 max-w-full rounded border bg-bg px-2 py-1 ${isError ? "border-error/20" : "border-success/20"}`}>
					{renderAsPre ? (
						<pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-snug text-text-secondary">
							{formatted}
						</pre>
					) : (
						<MarkdownRenderer content={content} />
					)}
				</div>
			) : null}
		</div>
	);
}

function parseChecklistResult(toolName: string | undefined, content: string): LionChecklistSnapshot | null {
	if (!toolName?.startsWith("lion_checklist_")) return null;
	try {
		const parsed = JSON.parse(content) as { checklist?: LionChecklistSnapshot };
		return parsed.checklist ?? null;
	} catch {
		return null;
	}
}

function summarizeToolResult(content: string, isError: boolean): string {
	const firstLine = content.split("\n").find((line) => line.trim())?.trim();
	if (!firstLine) return isError ? "No error output" : "No output";
	return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
}
