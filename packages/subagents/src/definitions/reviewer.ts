import { REVIEWER_BUILDER } from "../instructions/defaults.js";
import type { SubAgentDefinition } from "../types.js";

/**
 * Base template for review sub-agents.
 *
 * The orchestrator should pass the specific review criteria via
 * DelegationTask.prompt and DelegationTask.systemPrompt.
 */
export const reviewerDefinition: SubAgentDefinition = {
	name: "reviewer",
	description: "Code review and validation specialist",
	systemPrompt: "You are a code reviewer. Check implementations against criteria and report issues.",
	capabilities: { canEdit: false, canExecute: true, canWrite: false, canResearch: false },
	tools: ["read", "glob", "grep", "bash"],
	disabledTools: ["edit", "write", "multi-edit"],
	thinkingLevel: "medium",
	allowQuery: true,
	verboseTools: false,
	instructionBuilder: REVIEWER_BUILDER,
};
