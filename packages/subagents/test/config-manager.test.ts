import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { resolveConfiguredModel, SubAgentConfigManager } from "../src/config-manager.js";

function model(provider: string, id: string): Model<Api> {
	return {
		provider,
		id,
		name: id,
		api: "openai-completions",
		baseUrl: "https://example.com",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1000,
		maxTokens: 1000,
	};
}

function registry(models: Model<Api>[]) {
	return {
		getAvailable: () => models,
	};
}

describe("SubAgentConfigManager", () => {
	it("loads defaults when no project config exists", () => {
		const cwd = mkdtempSync(join(tmpdir(), "subagent-config-"));
		try {
			const manager = SubAgentConfigManager.load(cwd);
			expect(manager.getAgentConfig("planner")?.model).toBe("kimi-coding/kimi-for-coding");
			expect(manager.getAgentConfig("analyzer")?.model).toBe("deepseek/deepseek-v4-flash");
			expect(manager.getCompactionConfig()?.model).toBe("deepseek/deepseek-v4-flash");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("merges project overrides with defaults", () => {
		const cwd = mkdtempSync(join(tmpdir(), "subagent-config-"));
		try {
			mkdirSync(join(cwd, ".pi"));
			writeFileSync(
				join(cwd, ".pi", "subagents.json"),
				JSON.stringify({
					agents: {
						planner: { model: "deepseek/deepseek-v4-flash" },
					},
					compaction: { model: "kimi-coding/kimi-for-coding" },
				}),
			);

			const manager = SubAgentConfigManager.load(cwd);
			expect(manager.getAgentConfig("planner")?.model).toBe("deepseek/deepseek-v4-flash");
			expect(manager.getAgentConfig("planner")?.thinkingLevel).toBe("medium");
			expect(manager.getCompactionConfig()?.model).toBe("kimi-coding/kimi-for-coding");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("resolveConfiguredModel", () => {
	it("resolves provider/model references", () => {
		const resolved = resolveConfiguredModel(
			"kimi-coding/kimi-for-coding",
			undefined,
			registry([model("kimi-coding", "kimi-for-coding")]),
		);

		expect(resolved.model?.provider).toBe("kimi-coding");
		expect(resolved.model?.id).toBe("kimi-for-coding");
		expect(resolved.warnings).toEqual([]);
	});

	it("falls back when the primary model is unavailable", () => {
		const resolved = resolveConfiguredModel(
			"kimi-coding/kimi-for-coding",
			["deepseek/deepseek-v4-flash"],
			registry([model("deepseek", "deepseek-v4-flash")]),
		);

		expect(resolved.model?.provider).toBe("deepseek");
		expect(resolved.model?.id).toBe("deepseek-v4-flash");
		expect(resolved.warnings).toEqual([
			"Configured subagent model is unavailable or ambiguous: kimi-coding/kimi-for-coding",
		]);
	});
});
