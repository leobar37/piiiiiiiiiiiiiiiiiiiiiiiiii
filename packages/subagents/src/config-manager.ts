import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { SubAgentCompactionConfig, SubAgentProjectConfig, SubAgentRoleConfig } from "./types.js";

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

	static fromConfig(config: SubAgentProjectConfig): SubAgentConfigManager {
		return new SubAgentConfigManager(config);
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
