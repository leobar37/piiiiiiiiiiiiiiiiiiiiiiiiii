import { beforeEach, describe, expect, it, vi } from "vitest";
import { getModel } from "../src/models.js";
// @ts-expect-error Vitest should exercise the TS source, not ignored stale src JS artifacts.
import { streamAnthropic } from "../src/providers/anthropic.ts";
import type { Context, Model } from "../src/types.js";

const mockState = vi.hoisted(() => ({
	constructorOpts: undefined as Record<string, unknown> | undefined,
	createParams: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@anthropic-ai/sdk", () => {
	function createSseResponse(): Response {
		const body = [
			`event: message_start\ndata: ${JSON.stringify({
				type: "message_start",
				message: {
					id: "msg_test",
					usage: { input_tokens: 10, output_tokens: 0 },
				},
			})}\n`,
			`event: message_delta\ndata: ${JSON.stringify({
				type: "message_delta",
				delta: { stop_reason: "end_turn" },
				usage: { output_tokens: 5 },
			})}\n`,
		].join("\n");

		return new Response(body, {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});
	}

	class FakeAnthropic {
		constructor(opts: Record<string, unknown>) {
			mockState.constructorOpts = opts;
		}
		messages = {
			create: (params: Record<string, unknown>) => {
				mockState.createParams = params;
				return {
					asResponse: async () => createSseResponse(),
				};
			},
		};
	}

	return { default: FakeAnthropic };
});

beforeEach(() => {
	mockState.constructorOpts = undefined;
	mockState.createParams = undefined;
});

describe("Copilot Claude via Anthropic Messages", () => {
	const context: Context = {
		systemPrompt: "You are a helpful assistant.",
		messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
	};

	it("uses Bearer auth, Copilot headers, and valid Anthropic Messages payload", async () => {
		const model = getModel("github-copilot", "claude-sonnet-4.6");
		expect(model.api).toBe("anthropic-messages");

		const s = streamAnthropic(model, context, { apiKey: "tid_copilot_session_test_token" });
		for await (const event of s) {
			if (event.type === "error") break;
		}

		const opts = mockState.constructorOpts!;
		expect(opts).toBeDefined();

		// Auth: apiKey null, authToken for Bearer
		expect(opts.apiKey).toBeNull();
		expect(opts.authToken).toBe("tid_copilot_session_test_token");
		const headers = opts.defaultHeaders as Record<string, string>;

		// Copilot static headers from model.headers
		expect(headers["User-Agent"]).toContain("GitHubCopilotChat");
		expect(headers["Copilot-Integration-Id"]).toBe("vscode-chat");

		// Dynamic headers
		expect(headers["X-Initiator"]).toBe("user");
		expect(headers["Openai-Intent"]).toBe("conversation-edits");

		// No fine-grained-tool-streaming (Copilot doesn't support it)
		const beta = headers["anthropic-beta"] ?? "";
		expect(beta).not.toContain("fine-grained-tool-streaming");

		// Payload is valid Anthropic Messages format
		const params = mockState.createParams!;
		expect(params.model).toBe("claude-sonnet-4.6");
		expect(params.stream).toBe(true);
		expect(params.max_tokens).toBeGreaterThan(0);
		expect(Array.isArray(params.messages)).toBe(true);
	});

	it("omits interleaved-thinking beta for adaptive-thinking models", async () => {
		const model = getModel("github-copilot", "claude-sonnet-4.6");
		const s = streamAnthropic(model, context, {
			apiKey: "tid_copilot_session_test_token",
			interleavedThinking: true,
		});
		for await (const event of s) {
			if (event.type === "error") break;
		}

		const headers = mockState.constructorOpts!.defaultHeaders as Record<string, string>;
		expect(headers["anthropic-beta"] ?? "").not.toContain("interleaved-thinking-2025-05-14");
	});
});

describe("Anthropic-compatible combined context limit", () => {
	it("clamps max_tokens when compat counts max_tokens against the context window", async () => {
		const model: Model<"anthropic-messages"> = {
			id: "combined-limit-model",
			name: "Combined Limit Model",
			api: "anthropic-messages",
			provider: "combined-limit-provider",
			baseUrl: "https://example.com",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 30000,
			maxTokens: 10000,
			compat: { countsMaxTokensAgainstContextWindow: true },
		};
		const largeContext: Context = {
			messages: [{ role: "user", content: "x".repeat(84000), timestamp: Date.now() }],
		};

		const s = streamAnthropic(model, largeContext, { apiKey: "test", maxTokens: 10000 });
		for await (const event of s) {
			if (event.type === "error") break;
		}

		const params = mockState.createParams!;
		expect(params.max_tokens).toBeLessThan(10000);
		expect(params.max_tokens).toBeGreaterThan(0);
	});

	it("clamps max_tokens for Kimi even when generated compat metadata is absent", async () => {
		const model: Model<"anthropic-messages"> = {
			id: "kimi-for-coding",
			name: "Kimi For Coding",
			api: "anthropic-messages",
			provider: "kimi-coding",
			baseUrl: "https://example.com",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 30000,
			maxTokens: 10000,
		};
		const largeContext: Context = {
			messages: [{ role: "user", content: "x".repeat(84000), timestamp: Date.now() }],
		};

		const s = streamAnthropic(model, largeContext, { apiKey: "test", maxTokens: 10000 });
		for await (const event of s) {
			if (event.type === "error") break;
		}

		const params = mockState.createParams!;
		expect(params.max_tokens).toBeLessThan(10000);
		expect(params.max_tokens).toBeGreaterThan(0);
	});

	it("reapplies the clamp after onPayload changes max_tokens", async () => {
		const model: Model<"anthropic-messages"> = {
			id: "combined-limit-model",
			name: "Combined Limit Model",
			api: "anthropic-messages",
			provider: "combined-limit-provider",
			baseUrl: "https://example.com",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 30000,
			maxTokens: 10000,
			compat: { countsMaxTokensAgainstContextWindow: true },
		};
		const largeContext: Context = {
			messages: [{ role: "user", content: "x".repeat(84000), timestamp: Date.now() }],
		};

		const s = streamAnthropic(model, largeContext, {
			apiKey: "test",
			maxTokens: 10000,
			onPayload: (payload) => ({ ...(payload as Record<string, unknown>), max_tokens: 10000 }),
		});
		for await (const event of s) {
			if (event.type === "error") break;
		}

		const params = mockState.createParams!;
		expect(params.max_tokens).toBeLessThan(10000);
		expect(params.max_tokens).toBeGreaterThan(0);
	});

	it("returns a local context overflow error when no output budget remains", async () => {
		const model: Model<"anthropic-messages"> = {
			id: "combined-limit-model",
			name: "Combined Limit Model",
			api: "anthropic-messages",
			provider: "combined-limit-provider",
			baseUrl: "https://example.com",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 30000,
			maxTokens: 10000,
			compat: { countsMaxTokensAgainstContextWindow: true },
		};
		const oversizedContext: Context = {
			messages: [{ role: "user", content: "x".repeat(120000), timestamp: Date.now() }],
		};

		const s = streamAnthropic(model, oversizedContext, { apiKey: "test", maxTokens: 10000 });
		let errorMessage: string | undefined;
		for await (const event of s) {
			if (event.type === "error") {
				errorMessage = event.error.errorMessage;
			}
		}

		expect(errorMessage).toContain("Context length exceeded");
		expect(mockState.createParams).toBeUndefined();
	});

	it("leaves max_tokens unchanged without combined-limit compat", async () => {
		const model: Model<"anthropic-messages"> = {
			id: "standard-model",
			name: "Standard Model",
			api: "anthropic-messages",
			provider: "standard-provider",
			baseUrl: "https://example.com",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 30000,
			maxTokens: 10000,
		};
		const largeContext: Context = {
			messages: [{ role: "user", content: "x".repeat(84000), timestamp: Date.now() }],
		};

		const s = streamAnthropic(model, largeContext, { apiKey: "test", maxTokens: 10000 });
		for await (const event of s) {
			if (event.type === "error") break;
		}

		const params = mockState.createParams!;
		expect(params.max_tokens).toBe(10000);
	});
});
