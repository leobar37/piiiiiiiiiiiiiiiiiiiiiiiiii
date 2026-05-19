import type { SubAgentDefinition } from "../types.js";

/**
 * Base template for planning sub-agents.
 *
 * The orchestrator should pass task-specific instructions via
 * DelegationTask.systemPrompt / DelegationTask.prompt.
 */
export const plannerDefinition: SubAgentDefinition = {
	name: "planner",
	description: "Analysis and planning specialist",
	systemPrompt: "You are a planning specialist. Analyze problems and produce clear, actionable plans.",
	capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
	tools: ["read", "glob", "grep", "bash"],
	thinkingLevel: "medium",
	allowQuery: true,
	verboseTools: false,
};
