import { EXECUTOR_BUILDER } from "../instructions/defaults.js";
import type { SubAgentDefinition } from "../types.js";

/**
 * Base template for execution sub-agents.
 *
 * This is intentionally a blank slate. The orchestrator provides all
 * task-specific context, constraints, and instructions via:
 * - DelegationTask.prompt          (what to do)
 * - DelegationTask.systemPrompt    (how to behave)
 * - DelegationTask.capabilities    (what it can do)
 * - DelegationTask.tools           (which tools to use)
 *
 * The executor does not impose any generic behavior — it executes
 * exactly what the orchestrator describes.
 */
export const executorDefinition: SubAgentDefinition = {
	name: "executor",
	description: "Task execution worker",
	systemPrompt:
		"You are a non-interactive task executor. Follow the delegated plan and repository constraints, make the smallest useful changes, preserve unrelated work, validate according to scope with permitted commands, and record durable context for decisions, blockers, relevant files, and evidence.",
	capabilities: { canEdit: true, canExecute: true, canWrite: true, canResearch: false },
	model: "kimi-coding/kimi-for-coding",
	fallbackModels: ["deepseek/deepseek-v4-pro"],
	thinkingLevel: "high",
	allowQuery: true,
	verboseTools: true,
	instructionBuilder: EXECUTOR_BUILDER,
};
