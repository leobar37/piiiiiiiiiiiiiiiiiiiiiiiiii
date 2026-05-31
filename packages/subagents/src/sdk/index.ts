import { SubAgentConfigManager } from "../config-manager.js";
import type { SubAgentCompactionConfig, SubAgentProjectConfig, SubAgentRoleConfig } from "../types.js";

export type { SubAgentCompactionConfig, SubAgentProjectConfig, SubAgentRoleConfig };

export interface ConfigContext {
	/** Current working directory where the config is being loaded from. */
	cwd: string;
	/** Environment variables. */
	env: NodeJS.ProcessEnv;
}

export type ConfigFunction = (ctx: ConfigContext) => SubAgentProjectConfig | Promise<SubAgentProjectConfig>;

/**
 * Define a typed subagent configuration.
 *
 * Supports both static objects and async functions for dynamic configuration.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@earendil-works/pi-subagents/sdk";
 *
 * export default defineConfig({
 *   agents: {
 *     executor: { model: "kimi-coding/kimi-for-coding", thinkingLevel: "high" },
 *   },
 * });
 * ```
 *
 * @example
 * ```ts
 * import { defineConfig } from "@earendil-works/pi-subagents/sdk";
 *
 * export default defineConfig(async (ctx) => ({
 *   agents: {
 *     executor: {
 *       model: ctx.env.CI ? "deepseek/deepseek-v4-pro" : "kimi-coding/kimi-for-coding",
 *       thinkingLevel: "high",
 *     },
 *   },
 * }));
 * ```
 */
export function defineConfig(config: SubAgentProjectConfig | ConfigFunction): ConfigFunction {
	if (typeof config === "function") {
		return config;
	}
	return () => config;
}

/**
 * Create a default configuration with the built-in role presets.
 * Useful as a starting point for custom configs.
 */
export function createDefaultConfig(): SubAgentProjectConfig {
	const manager = SubAgentConfigManager.defaultsOnly();
	const planner = manager.getAgentConfig("planner");
	const analyzer = manager.getAgentConfig("analyzer");
	const executor = manager.getAgentConfig("executor");
	const reviewer = manager.getAgentConfig("reviewer");
	const compaction = manager.getCompactionConfig();

	if (!planner || !analyzer || !executor || !reviewer || !compaction) {
		throw new Error("createDefaultConfig: missing built-in default role configuration");
	}

	return structuredClone({
		agents: { planner, analyzer, executor, reviewer },
		compaction,
	});
}
