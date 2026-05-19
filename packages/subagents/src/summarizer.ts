import type { Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { convertToLlm } from "@earendil-works/pi-coding-agent";
import type { ConversationSummary, SummarizerOptions } from "./types.js";

const DEFAULT_SUMMARY_SYSTEM_PROMPT = `You are summarizing a coding agent's conversation for an external observer.
Describe what the agent has done so far, key decisions made, files modified, errors encountered, and what it is currently working on.
Be concise and specific. Use plain text, not markdown.`;

export class SubAgentSummarizer {
	summarize(sessionManager: SessionManager, options?: SummarizerOptions): ConversationSummary {
		const maxMessages = options?.maxMessages ?? 20;
		const maxTurns = options?.maxTurns ?? 5;
		const includeTools = options?.includeTools ?? true;

		const entries = sessionManager.getBranch();
		const messageEntries = entries.filter((e) => e.type === "message");

		const collected: typeof messageEntries = [];
		let turns = 0;
		for (let i = messageEntries.length - 1; i >= 0 && collected.length < maxMessages; i--) {
			const entry = messageEntries[i];
			collected.unshift(entry);
			const role = (entry as unknown as { message?: { role?: string } }).message?.role;
			if (role === "assistant") {
				turns++;
				if (turns >= maxTurns) break;
			}
		}

		const lines: string[] = [];
		let turnCount = 0;
		let toolCallCount = 0;
		let lastMessageAt = 0;

		for (const entry of collected) {
			const ts = (entry as unknown as { timestamp?: number }).timestamp;
			if (ts && ts > lastMessageAt) {
				lastMessageAt = ts;
			}

			const role = (entry as unknown as { message?: { role?: string } }).message?.role;
			if (role === "user") {
				const text = this.extractText(entry);
				lines.push(`> **User**: ${text.slice(0, 500)}${text.length > 500 ? "..." : ""}`);
			} else if (role === "assistant") {
				turnCount++;
				const text = this.extractText(entry);
				lines.push(`**Assistant**: ${text.slice(0, 500)}${text.length > 500 ? "..." : ""}`);

				const toolCalls = (entry as unknown as { message?: { toolCalls?: Array<{ name?: string }> } }).message
					?.toolCalls;
				if (includeTools && Array.isArray(toolCalls)) {
					for (const tc of toolCalls) {
						if (tc.name) {
							toolCallCount++;
							lines.push(`  → called **${tc.name}**`);
						}
					}
				}
			} else if (role === "toolResult" && includeTools) {
				const toolName = (entry as unknown as { toolName?: string }).toolName ?? "tool";
				const isError = (entry as unknown as { isError?: boolean }).isError ?? false;
				lines.push(`  → **${toolName}**: ${isError ? "error" : "success"}`);
			}
		}

		return {
			messageCount: collected.length,
			turnCount,
			toolCallCount,
			text: lines.join("\n"),
			lastMessageAt,
		};
	}

	async summarizeWithAI(
		sessionManager: SessionManager,
		model: Model<any>,
		apiKey: string,
		headers?: Record<string, string>,
		options?: SummarizerOptions,
	): Promise<ConversationSummary> {
		const maxMessages = options?.maxMessages ?? 20;
		const maxTurns = options?.maxTurns ?? 5;

		const entries = sessionManager.getBranch();
		const messageEntries = entries.filter((e) => e.type === "message");

		const collectedMessages = [];
		let turns = 0;
		for (let i = messageEntries.length - 1; i >= 0 && collectedMessages.length < maxMessages; i--) {
			const entry = messageEntries[i];
			collectedMessages.unshift(entry.message);
			const role = entry.message.role;
			if (role === "assistant") {
				turns++;
				if (turns >= maxTurns) break;
			}
		}

		let turnCount = 0;
		const toolCallCount = 0;
		let lastMessageAt = 0;

		for (const msg of collectedMessages) {
			if (msg.timestamp && msg.timestamp > lastMessageAt) {
				lastMessageAt = msg.timestamp;
			}
			if (msg.role === "assistant") {
				turnCount++;
			}
		}

		const llmMessages = convertToLlm(collectedMessages);

		const systemPrompt = options?.prompt ?? DEFAULT_SUMMARY_SYSTEM_PROMPT;

		const response = await completeSimple(
			model,
			{ systemPrompt, messages: llmMessages },
			{ apiKey, headers, maxTokens: 4096 },
		);

		const text = this.extractAssistantText(response);

		return {
			messageCount: collectedMessages.length,
			turnCount,
			toolCallCount,
			text: text || "[no summary available]",
			lastMessageAt,
		};
	}

	private extractText(entry: unknown): string {
		if (!entry || typeof entry !== "object") return "";
		const msg = (entry as { message?: { content?: unknown } }).message;
		if (!msg) return "";
		const content = msg.content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			return content
				.filter((c) => typeof c === "object" && c !== null && "type" in c && c.type === "text")
				.map((c) => (c as { text?: string }).text ?? "")
				.join("");
		}
		return "";
	}

	private extractAssistantText(message: { role: string; content: unknown }): string {
		if (message.role !== "assistant") return "";
		const content = message.content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			return (content as Array<{ type?: string; text?: string }>)
				.filter((c) => c.type === "text")
				.map((c) => c.text ?? "")
				.join("");
		}
		return "";
	}
}
