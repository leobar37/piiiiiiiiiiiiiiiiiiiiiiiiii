import { REVIEWER_BUILDER } from "../instructions/defaults.js";
import { getInternalSkillPath } from "../internal-skills.js";
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
	systemPrompt:
		"You are a non-interactive reviewer. Review against the delegated criteria and evidence, do not edit files, lead with blocking findings, and do not approve work without proof from inspected code, tests, commands, or explicit checks. Before reporting a suspected issue, check the most likely false-positive explanation from callers, guards, tests, config, schemas, or intended behavior. Treat missing validation as a risk or blocker.",
	capabilities: { canEdit: false, canExecute: true, canWrite: false, canResearch: false },
	tools: ["read", "glob", "grep", "bash"],
	disabledTools: ["edit", "write", "multi-edit"],
	skillPaths: [getInternalSkillPath("code-review")],
	model: "deepseek/deepseek-v4-pro",
	fallbackModels: ["kimi-coding/kimi-for-coding"],
	thinkingLevel: "medium",
	allowQuery: true,
	verboseTools: false,
	instructionBuilder: REVIEWER_BUILDER,
};
