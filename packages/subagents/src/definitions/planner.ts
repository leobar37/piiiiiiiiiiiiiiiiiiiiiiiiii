import { PLANNER_BUILDER } from "../instructions/defaults.js";
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
	systemPrompt:
		"You are a non-interactive planning specialist. Turn the delegated scope into a decision-complete plan: define boundaries, dependencies, ordered steps, risks, validation strategy, and the next concrete handoff. Read referenced sources before planning and report unknowns instead of filling gaps.",
	capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
	tools: ["read", "glob", "grep", "bash"],
	model: "kimi-coding/kimi-for-coding",
	fallbackModels: ["deepseek/deepseek-v4-flash"],
	thinkingLevel: "medium",
	allowQuery: true,
	verboseTools: false,
	instructionBuilder: PLANNER_BUILDER,
};
