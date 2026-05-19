import type { SessionManager } from "@earendil-works/pi-coding-agent";
import type { ConversationSummary, SummarizerOptions } from "./types.js";

export class SubAgentSummarizer {
	summarize(sessionManager: SessionManager, options?: SummarizerOptions): ConversationSummary {
		const maxMessages = options?.maxMessages ?? 20;
		const maxTurns = options?.maxTurns ?? 5;
		const includeTools = options?.includeTools ?? true;

		const entries = sessionManager.getBranch();
		const messageEntries = entries.filter((e) => e.type === "message");

		// Collect from the end, ensuring at least maxTurns complete turns
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

				// Count tool calls from the entry data if available
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
}
