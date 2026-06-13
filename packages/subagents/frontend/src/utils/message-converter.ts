import type { ChatMessage, MessageBlock } from "../types.ts";

/**
 * Backend message types (mirroring pi-ai / pi-agent-core).
 * These are what the backend API returns.
 */
interface BackendTextContent {
	type: "text";
	text: string;
	textSignature?: string;
}

interface BackendImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

interface BackendThinkingContent {
	type: "thinking";
	thinking: string;
	thinkingSignature?: string;
	redacted?: boolean;
}

interface BackendToolCall {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	thoughtSignature?: string;
}

interface BackendUserMessage {
	role: "user";
	content: string | (BackendTextContent | BackendImageContent)[];
	timestamp: number;
	messageId?: string;
}

interface BackendAssistantMessage {
	role: "assistant";
	content: (BackendTextContent | BackendThinkingContent | BackendToolCall)[];
	timestamp: number;
	messageId?: string;
}

interface BackendToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (BackendTextContent | BackendImageContent)[];
	isError: boolean;
	timestamp: number;
}

interface BackendBashExecutionMessage {
	role: "bashExecution";
	command: string;
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	timestamp: number;
}

interface BackendCustomMessage {
	role: "custom";
	customType: string;
	content: string | (BackendTextContent | BackendImageContent)[];
	timestamp: number;
}

type BackendMessage =
	| BackendUserMessage
	| BackendAssistantMessage
	| BackendToolResultMessage
	| BackendBashExecutionMessage
	| BackendCustomMessage
	| { role: string; [key: string]: unknown };

function contentToBlocks(content: unknown): MessageBlock[] {
	if (typeof content === "string") {
		return [{ type: "text", text: content }];
	}
	if (!Array.isArray(content)) {
		return [{ type: "text", text: JSON.stringify(content) }];
	}
	const blocks: MessageBlock[] = [];
	for (const item of content) {
		if (typeof item !== "object" || item === null) continue;
		switch (item.type) {
			case "text":
				blocks.push({ type: "text", text: item.text ?? "" });
				break;
			case "image":
				blocks.push({ type: "image", data: item.data ?? "", mimeType: item.mimeType ?? "image/png" });
				break;
			case "thinking":
				blocks.push({
					type: "thinking",
					thinking: item.thinking ?? "",
					signature: item.thinkingSignature,
					redacted: item.redacted,
				});
				break;
			case "toolCall":
				blocks.push({
					type: "toolCall",
					id: item.id ?? "",
					name: item.name ?? "",
					arguments: item.arguments ?? {},
				});
				break;
			default:
				blocks.push({ type: "text", text: JSON.stringify(item) });
		}
	}
	return blocks;
}

function toolResultToBlocks(msg: BackendToolResultMessage): MessageBlock[] {
	const text = contentToText(msg.content);
	return [{ type: "toolResult", toolCallId: msg.toolCallId, toolName: msg.toolName, content: text, isError: msg.isError }];
}

function contentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return JSON.stringify(content);
	return content
		.filter((item) => typeof item === "object" && item !== null && item.type === "text")
		.map((item) => item.text)
		.join("");
}

function makeId(instanceId: string, msg: BackendMessage, role: string, timestamp: number, index: number): string {
	const candidate = "id" in msg ? msg.id : undefined;
	if (typeof candidate === "string" && candidate.trim()) return candidate;
	const messageId = "messageId" in msg ? msg.messageId : undefined;
	if (typeof messageId === "string" && messageId.trim()) return messageId;
	return `${instanceId}-${role}-${timestamp}-${index}`;
}

export function convertAgentMessages(instanceId: string, messages: Array<Record<string, unknown>>): ChatMessage[] {
	const result: ChatMessage[] = [];
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i] as BackendMessage;
		const role = typeof msg.role === "string" ? msg.role : "unknown";
		const timestamp = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();
		const id = makeId(instanceId, msg, role, timestamp, i);

		switch (role) {
			case "user": {
				const um = msg as BackendUserMessage;
				result.push({
					id,
					instanceId,
					role: "user",
					blocks: contentToBlocks(um.content),
					timestamp,
				});
				break;
			}
			case "assistant": {
				const am = msg as BackendAssistantMessage;
				result.push({
					id,
					instanceId,
					role: "assistant",
					blocks: contentToBlocks(am.content),
					timestamp,
					stopReason: (msg as Record<string, unknown>).stopReason as string | undefined,
					errorMessage: (msg as Record<string, unknown>).errorMessage as string | undefined,
				});
				break;
			}
			case "toolResult": {
				const tr = msg as BackendToolResultMessage;
				result.push({
					id,
					instanceId,
					role: "tool",
					blocks: toolResultToBlocks(tr),
					timestamp,
				});
				break;
			}
			case "bashExecution": {
				const be = msg as BackendBashExecutionMessage;
				const text = `\`\`\`bash\n$ ${be.command}\n${be.output}\n\`\`\``;
				result.push({
					id,
					instanceId,
					role: "system",
					blocks: [{ type: "text", text }],
					timestamp,
				});
				break;
			}
			case "custom": {
				const cm = msg as BackendCustomMessage;
				result.push({
					id,
					instanceId,
					role: "system",
					blocks: contentToBlocks(cm.content),
					timestamp,
				});
				break;
			}
			default: {
				// Unknown role — render as system text
				result.push({
					id,
					instanceId,
					role: "system",
					blocks: [{ type: "text", text: JSON.stringify(msg) }],
					timestamp,
				});
			}
		}
	}
	return result;
}
