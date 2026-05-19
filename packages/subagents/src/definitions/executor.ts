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
	systemPrompt: "You are a task executor. Follow the instructions provided to you precisely.",
	capabilities: { canEdit: true, canExecute: true, canWrite: true, canResearch: false },
	thinkingLevel: "high",
	allowQuery: true,
	verboseTools: true,
	instructionBuilder: EXECUTOR_BUILDER,
};
