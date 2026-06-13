import { useCallback, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { ChatMessage, MessageBlock } from "../types.ts";
import { messageToText } from "../utils/message-text.ts";
import { BlockRenderer } from "./blocks/BlockRenderer";

interface MessageItemProps {
	message: ChatMessage;
}

export function MessageItem({ message }: MessageItemProps) {
	const [copied, setCopied] = useState(false);
	const isUser = message.role === "user";
	const isAssistant = message.role === "assistant";
	const isTool = message.role === "tool";
	const copyText = useMemo(() => messageToText(message), [message]);
	const thinkingBlocks = isAssistant ? message.blocks.filter(isThinkingBlock) : [];
	const toolGroups = isAssistant ? groupToolBlocks(message.blocks.filter(isToolBlock)) : [];
	const visibleBlocks = isAssistant
		? message.blocks.filter((block) => !isThinkingBlock(block) && !isToolBlock(block))
		: message.blocks;

	const handleCopy = useCallback(() => {
		if (!copyText.trim()) return;
		copyToClipboard(copyText).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		});
	}, [copyText]);

	if (isTool) {
		return (
			<div className="group flex min-w-0 justify-start overflow-x-hidden">
				<div className="max-w-[85%] min-w-0 overflow-x-hidden select-text">
					<div className="min-w-0 space-y-1">
						{message.blocks.map((block, i) => (
							<BlockRenderer key={i} block={block} currentThreadId={message.instanceId} />
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={`group flex min-w-0 overflow-x-hidden ${isUser ? "justify-end" : "justify-start"}`}>
			<div className={`max-w-[85%] min-w-0 overflow-x-hidden select-text space-y-2 ${isUser ? "items-end" : "items-start"}`}>
				{thinkingBlocks.length > 0 ? (
					<div className="min-w-0 space-y-1">
						{thinkingBlocks.map((block, index) => (
							<BlockRenderer key={`thinking-${index}`} block={block} currentThreadId={message.instanceId} />
						))}
					</div>
				) : null}
				{visibleBlocks.length > 0 ? (
					<div
						className={`relative min-w-0 rounded-md px-3 py-2 ${
							isUser ? "bg-accent-muted" : isAssistant ? "bg-bg-elevated" : "bg-bg-surface"
						}`}
					>
						<button
							type="button"
							onClick={handleCopy}
							disabled={!copyText.trim()}
							title="Copy message"
							className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded border border-border-subtle bg-bg-elevated/80 text-text-muted opacity-0 transition hover:border-border-hover hover:text-text-primary group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
						>
							{copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
						</button>
						<div className="min-w-0 overflow-x-hidden space-y-1 pr-6">
							{visibleBlocks.map((block, index) => (
								<BlockRenderer key={index} block={block} currentThreadId={message.instanceId} />
							))}
						</div>
					</div>
				) : null}
				{toolGroups.length > 0 ? (
					<div className="min-w-0 space-y-0.5">
						{toolGroups.map((blocks, index) => (
							<div key={`tool-${index}`} className="min-w-0 space-y-0.5">
								{blocks.map((block, blockIndex) => (
									<BlockRenderer
										key={`${block.type}-${blockIndex}`}
										block={block}
										currentThreadId={message.instanceId}
									/>
								))}
							</div>
						))}
					</div>
				) : null}
				{message.stopReason === "aborted" && (
					<span className="text-xs text-error italic">Request aborted</span>
				)}
			</div>
		</div>
	);
}

function isThinkingBlock(block: MessageBlock): block is Extract<MessageBlock, { type: "thinking" }> {
	return block.type === "thinking";
}

function isToolBlock(block: MessageBlock): block is Extract<MessageBlock, { type: "toolCall" | "toolResult" }> {
	return block.type === "toolCall" || block.type === "toolResult";
}

function groupToolBlocks(blocks: Array<Extract<MessageBlock, { type: "toolCall" | "toolResult" }>>): Array<typeof blocks> {
	const groups: Array<typeof blocks> = [];
	const pendingByToolCallId = new Map<string, typeof blocks>();
	for (const block of blocks) {
		if (block.type === "toolCall") {
			const group: typeof blocks = [block];
			groups.push(group);
			pendingByToolCallId.set(block.id, group);
			continue;
		}
		const group = pendingByToolCallId.get(block.toolCallId);
		if (group) {
			group.push(block);
			pendingByToolCallId.delete(block.toolCallId);
			continue;
		}
		groups.push([block]);
	}
	return groups;
}

async function copyToClipboard(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		return;
	} catch {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.left = "-9999px";
		document.body.appendChild(textarea);
		textarea.select();
		const success = document.execCommand("copy");
		document.body.removeChild(textarea);
		if (!success) {
			throw new Error("Clipboard fallback failed");
		}
	}
}
