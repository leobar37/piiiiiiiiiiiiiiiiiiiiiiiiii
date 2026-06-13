import { MarkdownRenderer } from "./MarkdownRenderer";
import { useState } from "react";
import { CheckCircle2, ChevronDown, XCircle } from "lucide-react";
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
				className={`inline-flex max-w-full items-center gap-1.5 px-0 py-0.5 text-[11px] leading-4 transition ${
					isError ? "text-error hover:text-error" : "text-success hover:text-success"
				}`}
			>
				{isError ? (
					<XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
				) : (
					<CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
				)}
				<span className="shrink-0 font-medium">{isError ? "Error" : "Result"}</span>
				<span className="truncate text-text-secondary">{summary}</span>
				<ChevronDown
					className={`h-3 w-3 shrink-0 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
					aria-hidden="true"
				/>
			</button>
			{isExpanded ? (
				<div className="mt-1 max-w-full pl-4">
					{renderAsPre ? (
						<pre className="max-h-32 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-text-secondary">
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
