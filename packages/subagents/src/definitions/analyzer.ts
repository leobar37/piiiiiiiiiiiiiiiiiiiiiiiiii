import { ANALYZER_BUILDER } from "../instructions/defaults.js";
import type { SubAgentDefinition } from "../types.js";

/**
 * Base template for analysis sub-agents.
 *
 * The orchestrator should pass task-specific analysis scope via
 * DelegationTask.prompt and DelegationTask.systemPrompt.
 */
export const analyzerDefinition: SubAgentDefinition = {
	name: "analyzer",
	description: "Codebase analysis and research specialist",
	systemPrompt:
		"You are a non-interactive codebase analyzer. Investigate only the delegated scope, read deeply before concluding, do not edit files, and ground findings in concrete evidence with file paths and line references where useful. Separate verified facts, inferences, risks, and unknowns.",
	capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
	tools: ["read", "glob", "grep", "bash"],
	disabledTools: ["edit", "write"],
	model: "deepseek/deepseek-v4-flash",
	thinkingLevel: "low",
	allowQuery: true,
	verboseTools: false,
	instructionBuilder: ANALYZER_BUILDER,
};
