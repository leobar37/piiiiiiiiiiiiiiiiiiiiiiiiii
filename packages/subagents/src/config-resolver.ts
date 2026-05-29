import type {
	DelegationTask,
	EffectiveSubAgentConfig,
	SubAgentCapabilities,
	SubAgentDefinition,
	SubAgentRoleConfig,
} from "./types.js";

/**
 * Merge a base SubAgentDefinition with a DelegationTask's dynamic overrides
 * to produce the effective configuration used at runtime.
 */
export function resolveEffectiveConfig(
	definition: SubAgentDefinition,
	task: DelegationTask,
	options?: { agentConfig?: SubAgentRoleConfig },
): EffectiveSubAgentConfig {
	const agentConfig = options?.agentConfig;

	// Merge system prompts
	const systemPrompt = mergeSystemPrompt(
		definition.systemPrompt,
		task.systemPrompt,
		task.systemPromptMode ?? "append",
	);

	// Merge capabilities
	const capabilities: SubAgentCapabilities = {
		...definition.capabilities,
		...task.capabilities,
	};

	// Merge disabled tools
	const disabledTools = [...(definition.disabledTools ?? []), ...(task.disabledTools ?? [])];
	const skillPaths = [...(definition.skillPaths ?? []), ...(task.skillPaths ?? [])];

	return {
		name: definition.name,
		description: task.description ?? definition.description,
		systemPrompt,
		capabilities,
		tools: task.tools ?? definition.tools,
		disabledTools: disabledTools.length > 0 ? disabledTools : undefined,
		skillPaths: skillPaths.length > 0 ? Array.from(new Set(skillPaths)) : undefined,
		model: task.model ?? agentConfig?.model ?? definition.model,
		fallbackModels: task.fallbackModels ?? agentConfig?.fallbackModels ?? definition.fallbackModels,
		thinkingLevel: task.thinkingLevel ?? agentConfig?.thinkingLevel ?? definition.thinkingLevel,
		cwd: definition.cwd,
		isolated: definition.isolated,
		extensionFactory: definition.extensionFactory,
		maxTurns: task.maxTurns ?? definition.maxTurns,
		timeout: task.timeout ?? definition.timeout,
		allowQuery: task.allowQuery ?? definition.allowQuery,
		verboseTools: task.verboseTools ?? definition.verboseTools,
		instructionBuilder: task.instructionBuilder ?? definition.instructionBuilder,
	};
}

function mergeSystemPrompt(base: string, override: string | undefined, mode: "replace" | "append" | "prepend"): string {
	if (!override) return base;

	switch (mode) {
		case "replace":
			return override;
		case "prepend":
			return `${override}\n\n${base}`;
		default:
			return `${base}\n\n${override}`;
	}
}
