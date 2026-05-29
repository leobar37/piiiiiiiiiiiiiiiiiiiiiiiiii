import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { SubAgentCompactionConfig, SubAgentProjectConfig, SubAgentRoleConfig } from "./types.js";

export const SUBAGENT_CONFIG_PATH = join(".pi", "subagents.json");

const DEFAULT_AGENT_CONFIGS: Record<string, SubAgentRoleConfig> = {
	planner: {
		model: "kimi-coding/kimi-for-coding",
		fallbackModels: ["deepseek/deepseek-v4-flash"],
		thinkingLevel: "medium",
	},
	analyzer: {
		model: "deepseek/deepseek-v4-flash",
		thinkingLevel: "low",
	},
	executor: {
		model: "kimi-coding/kimi-for-coding",
		fallbackModels: ["deepseek/deepseek-v4-pro"],
		thinkingLevel: "high",
	},
	reviewer: {
		model: "deepseek/deepseek-v4-pro",
		fallbackModels: ["kimi-coding/kimi-for-coding"],
		thinkingLevel: "medium",
	},
};

const DEFAULT_COMPACTION_CONFIG: SubAgentCompactionConfig = {
	model: "deepseek/deepseek-v4-flash",
};

export interface ModelResolutionResult {
	model?: Model<Api>;
	warnings: string[];
}

export class SubAgentConfigManager {
	private constructor(private readonly config: SubAgentProjectConfig) {}

	static load(cwd: string): SubAgentConfigManager {
		const path = join(cwd, SUBAGENT_CONFIG_PATH);
		if (!existsSync(path)) {
			return new SubAgentConfigManager({});
		}

		const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
		return new SubAgentConfigManager(parseProjectConfig(parsed, path));
	}

	static defaultsOnly(): SubAgentConfigManager {
		return new SubAgentConfigManager({});
	}

	getAgentConfig(name: string): SubAgentRoleConfig | undefined {
		const defaults = DEFAULT_AGENT_CONFIGS[name];
		const override = this.config.agents?.[name];
		if (!defaults && !override) return undefined;
		return {
			model: override?.model ?? defaults?.model,
			fallbackModels: override?.fallbackModels ?? defaults?.fallbackModels,
			thinkingLevel: override?.thinkingLevel ?? defaults?.thinkingLevel,
		};
	}

	getCompactionConfig(): SubAgentCompactionConfig | undefined {
		return { ...DEFAULT_COMPACTION_CONFIG, ...this.config.compaction };
	}

	resolveModelForAgent(name: string, modelRegistry: ModelRegistry | undefined): ModelResolutionResult {
		const config = this.getAgentConfig(name);
		return resolveConfiguredModel(config?.model, config?.fallbackModels, modelRegistry);
	}
}

export function resolveConfiguredModel(
	modelReference: string | undefined,
	fallbackReferences: string[] | undefined,
	modelRegistry: Pick<ModelRegistry, "getAvailable"> | undefined,
): ModelResolutionResult {
	if (!modelReference || !modelRegistry) return { warnings: [] };

	const availableModels = modelRegistry.getAvailable();
	const warnings: string[] = [];
	const references = [modelReference, ...(fallbackReferences ?? [])];

	for (const reference of references) {
		const resolved = resolveModelReference(reference, availableModels);
		if (resolved) {
			return { model: resolved, warnings };
		}
		warnings.push(`Configured subagent model is unavailable or ambiguous: ${reference}`);
	}

	return { warnings };
}

function resolveModelReference(reference: string, availableModels: Model<Api>[]): Model<Api> | undefined {
	const trimmed = reference.trim();
	if (!trimmed) return undefined;

	const slashIndex = trimmed.indexOf("/");
	if (slashIndex > 0) {
		const provider = trimmed.slice(0, slashIndex);
		const modelId = trimmed.slice(slashIndex + 1);
		const providerMatch = availableModels.find(
			(model) =>
				model.provider.toLowerCase() === provider.toLowerCase() && model.id.toLowerCase() === modelId.toLowerCase(),
		);
		if (providerMatch) return providerMatch;
	}

	const exactMatches = availableModels.filter((model) => model.id.toLowerCase() === trimmed.toLowerCase());
	return exactMatches.length === 1 ? exactMatches[0] : undefined;
}

function parseProjectConfig(value: unknown, path: string): SubAgentProjectConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid subagents config at ${path}: expected object`);
	}

	const raw = value as { agents?: unknown; compaction?: unknown };
	return {
		agents: raw.agents === undefined ? undefined : parseAgents(raw.agents, path),
		compaction: raw.compaction === undefined ? undefined : parseCompaction(raw.compaction, path),
	};
}

function parseAgents(value: unknown, path: string): Record<string, SubAgentRoleConfig> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid subagents config at ${path}: agents must be an object`);
	}

	const agents: Record<string, SubAgentRoleConfig> = {};
	for (const [name, rawConfig] of Object.entries(value)) {
		if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
			throw new Error(`Invalid subagents config at ${path}: agents.${name} must be an object`);
		}
		agents[name] = parseRoleConfig(rawConfig as Record<string, unknown>, `${path}: agents.${name}`);
	}
	return agents;
}

function parseRoleConfig(value: Record<string, unknown>, label: string): SubAgentRoleConfig {
	const model = optionalString(value.model, `${label}.model`);
	const fallbackModels = optionalStringArray(value.fallbackModels, `${label}.fallbackModels`);
	const thinkingLevel = optionalThinkingLevel(value.thinkingLevel, `${label}.thinkingLevel`);
	return { model, fallbackModels, thinkingLevel };
}

function parseCompaction(value: unknown, path: string): SubAgentCompactionConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`Invalid subagents config at ${path}: compaction must be an object`);
	}
	const raw = value as { model?: unknown };
	return { model: optionalString(raw.model, `${path}: compaction.model`) };
}

function optionalString(value: unknown, label: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`Invalid subagents config: ${label} must be a non-empty string`);
	}
	return value;
}

function optionalStringArray(value: unknown, label: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
		throw new Error(`Invalid subagents config: ${label} must be an array of non-empty strings`);
	}
	return value;
}

function optionalThinkingLevel(value: unknown, label: string): SubAgentRoleConfig["thinkingLevel"] | undefined {
	if (value === undefined) return undefined;
	if (value !== "off" && value !== "minimal" && value !== "low" && value !== "medium" && value !== "high") {
		throw new Error(`Invalid subagents config: ${label} must be off, minimal, low, medium, or high`);
	}
	return value;
}
