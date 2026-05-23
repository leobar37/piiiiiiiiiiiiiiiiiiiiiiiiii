import { describe, expect, it, vi } from "vitest";
import { SubAgentSummarizer } from "../src/summarizer.js";

function createFakeSessionManager(
	entries: Array<{
		type: string;
		message?: {
			role: string;
			content: string | Array<unknown>;
			toolCalls?: Array<{ name: string }>;
			toolName?: string;
			isError?: boolean;
		};
		timestamp?: number;
		toolName?: string;
		isError?: boolean;
	}> = [],
) {
	return {
		getBranch: vi.fn().mockReturnValue(entries),
	};
}

describe("SubAgentSummarizer", () => {
	const summarizer = new SubAgentSummarizer();

	it("summarize with empty session returns empty summary", () => {
		const sm = createFakeSessionManager([]);
		const summary = summarizer.summarize(sm as any);
		expect(summary.messageCount).toBe(0);
		expect(summary.turnCount).toBe(0);
		expect(summary.toolCallCount).toBe(0);
		expect(summary.text).toBe("");
		expect(summary.lastMessageAt).toBe(0);
	});

	it("summarize extracts user and assistant messages", () => {
		const sm = createFakeSessionManager([
			{ type: "message", message: { role: "user", content: "Hello" }, timestamp: 1000 },
			{ type: "message", message: { role: "assistant", content: "Hi there!" }, timestamp: 2000 },
		]);

		const summary = summarizer.summarize(sm as any);
		expect(summary.messageCount).toBe(2);
		expect(summary.turnCount).toBe(1);
		expect(summary.text).toContain("**User**: Hello");
		expect(summary.text).toContain("**Assistant**: Hi there!");
	});

	it("summarize respects maxMessages limit", () => {
		const entries = [];
		for (let i = 0; i < 30; i++) {
			entries.push({ type: "message", message: { role: "user", content: `msg-${i}` }, timestamp: i * 1000 });
		}

		const sm = createFakeSessionManager(entries);
		const summary = summarizer.summarize(sm as any, { maxMessages: 10 });
		expect(summary.messageCount).toBeLessThanOrEqual(10);
	});

	it("summarize respects maxTurns limit", () => {
		const entries = [];
		for (let i = 0; i < 10; i++) {
			entries.push({ type: "message", message: { role: "user", content: `user-${i}` }, timestamp: i * 2000 });
			entries.push({
				type: "message",
				message: { role: "assistant", content: `assistant-${i}` },
				timestamp: i * 2000 + 1000,
			});
		}

		const sm = createFakeSessionManager(entries);
		const summary = summarizer.summarize(sm as any, { maxTurns: 2 });
		expect(summary.turnCount).toBeLessThanOrEqual(2);
	});

	it("summarize includes tool calls when includeTools=true", () => {
		const sm = createFakeSessionManager([
			{ type: "message", message: { role: "user", content: "Do something" }, timestamp: 1000 },
			{
				type: "message",
				message: {
					role: "assistant",
					content: "Running tools...",
					toolCalls: [{ name: "read" }, { name: "edit" }],
				},
				timestamp: 2000,
			},
		]);

		const summary = summarizer.summarize(sm as any, { includeTools: true });
		expect(summary.toolCallCount).toBe(2);
		expect(summary.text).toContain("called **read**");
		expect(summary.text).toContain("called **edit**");
	});

	it("summarize excludes tool calls when includeTools=false", () => {
		const sm = createFakeSessionManager([
			{ type: "message", message: { role: "user", content: "Do something" }, timestamp: 1000 },
			{
				type: "message",
				message: { role: "assistant", content: "Running tools...", toolCalls: [{ name: "read" }] },
				timestamp: 2000,
			},
		]);

		const summary = summarizer.summarize(sm as any, { includeTools: false });
		expect(summary.text).not.toContain("called");
	});

	it("truncates text at 500 chars", () => {
		const longContent = "a".repeat(1000);
		const sm = createFakeSessionManager([
			{ type: "message", message: { role: "user", content: longContent }, timestamp: 1000 },
		]);

		const summary = summarizer.summarize(sm as any);
		expect(summary.text).toContain("...");
		expect(summary.text.length).toBeGreaterThan(500);
		expect(summary.text.length).toBeLessThan(600); // 500 + "> **User**: " prefix + "..." suffix
	});

	it("includes tool result entries when includeTools=true", () => {
		const sm = createFakeSessionManager([
			{ type: "message", message: { role: "user", content: "Run it" }, timestamp: 1000 },
			{
				type: "message",
				message: { role: "assistant", content: "Done", toolCalls: [{ name: "bash" }] },
				timestamp: 2000,
			},
			{
				type: "message",
				message: { role: "toolResult", content: "output ok", toolName: "bash", isError: false },
				timestamp: 3000,
			},
		]);

		const summary = summarizer.summarize(sm as any, { includeTools: true });
		expect(summary.text).toContain("bash");
		expect(summary.text).toContain("success");
	});

	it("handles array content in messages", () => {
		const sm = createFakeSessionManager([
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "Hello " },
						{ type: "text", text: "world" },
					],
				},
				timestamp: 1000,
			},
		]);

		const summary = summarizer.summarize(sm as any);
		expect(summary.text).toContain("Hello world");
	});
});
