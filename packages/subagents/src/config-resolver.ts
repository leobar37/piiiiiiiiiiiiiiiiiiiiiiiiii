import type { DelegationTask, EffectiveSubAgentConfig, SubAgentCapabilities, SubAgentDefinition } from "./types.js";

/**
 * Merge a base SubAgentDefinition with a DelegationTask's dynamic overrides
 * to produce the effective configuration used at runtime.
 */
export function resolveEffectiveConfig(definition: SubAgentDefinition, task: DelegationTask): EffectiveSubAgentConfig {
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

	return {
		name: definition.name,
		description: task.description ?? definition.description,
		systemPrompt,
		capabilities,
		tools: task.tools ?? definition.tools,
		disabledTools: disabledTools.length > 0 ? disabledTools : undefined,
		model: task.model ?? definition.model,
		thinkingLevel: task.thinkingLevel ?? definition.thinkingLevel,
		cwd: definition.cwd,
		isolated: definition.isolated,
		extensionFactory: definition.extensionFactory,
		maxTurns: task.maxTurns ?? definition.maxTurns,
		timeout: task.timeout ?? definition.timeout,
		allowQuery: task.allowQuery ?? definition.allowQuery,
		verboseTools: task.verboseTools ?? definition.verboseTools,
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
