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
	systemPrompt: "You are a codebase analyst. Investigate, trace execution paths, and report findings.",
	capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
	tools: ["read", "glob", "grep", "bash"],
	disabledTools: ["edit", "write"],
	thinkingLevel: "low",
	allowQuery: true,
	verboseTools: false,
};
