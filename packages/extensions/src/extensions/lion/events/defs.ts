import { createEvent, type SubAgentEvent } from "@local/pi-subagents";
import type {
	LionBuildResult,
	LionDelegationAgent,
	LionMode,
	LionPlanKind,
	LionReviewVerdict,
	LionTaskStrategy,
	LionTasksResult,
} from "../types.js";

// =============================================================================
// Lion Event Creators
//
// Cada payload incluye metadata contextual (runId, planSlug, etc.) ademas
// de los campos semanticos. Los consumers acceden via event.payload.*.
// =============================================================================

export const LionEvents = {
	activateStart: createEvent<"lion.activate.start", { runId: string; input?: string }>("lion.activate.start"),

	activateComplete: createEvent<"lion.activate.complete", { runId: string; mode: LionMode }>("lion.activate.complete"),

	planLoaded: createEvent<
		"lion.plan.loaded",
		{ runId: string; planSlug: string; planPath: string; taskCount: number; kind: LionPlanKind }
	>("lion.plan.loaded"),

	modeChanged: createEvent<"lion.mode.changed", { runId: string; mode: LionMode }>("lion.mode.changed"),

	buildStart: createEvent<"lion.build.start", { runId: string; planSlug: string; planPath: string; taskId?: string }>(
		"lion.build.start",
	),

	taskSelected: createEvent<
		"lion.task.selected",
		{ runId: string; planSlug: string; planPath: string; taskId: string; title: string }
	>("lion.task.selected"),

	delegationPromptCreated: createEvent<
		"lion.delegation.prompt.created",
		{
			runId: string;
			planSlug: string;
			planPath: string;
			taskId: string;
			attempt: number;
			agent: LionDelegationAgent;
			promptLength: number;
		}
	>("lion.delegation.prompt.created"),

	delegationStart: createEvent<
		"lion.delegation.start",
		{
			runId: string;
			planSlug: string;
			planPath: string;
			taskId: string;
			attempt: number;
			agent: LionDelegationAgent;
		}
	>("lion.delegation.start"),

	delegationEnd: createEvent<
		"lion.delegation.end",
		{
			runId: string;
			planSlug: string;
			planPath: string;
			taskId: string;
			attempt: number;
			agent: LionDelegationAgent;
			status: string;
			summary: string;
		}
	>("lion.delegation.end"),

	validationStart: createEvent<
		"lion.validation.start",
		{ runId: string; planSlug: string; planPath: string; taskId?: string; focus?: string }
	>("lion.validation.start"),

	validationEnd: createEvent<
		"lion.validation.end",
		{ runId: string; planSlug: string; planPath: string; taskId?: string; status: string; summary: string }
	>("lion.validation.end"),

	reviewVerdict: createEvent<
		"lion.review.verdict",
		{
			runId: string;
			planSlug: string;
			planPath: string;
			taskId: string;
			attempt: number;
			verdict: LionReviewVerdict;
			summary: string;
		}
	>("lion.review.verdict"),

	correctionRequested: createEvent<
		"lion.correction.requested",
		{ runId: string; planSlug: string; planPath: string; taskId: string; feedback: string }
	>("lion.correction.requested"),

	taskApproved: createEvent<
		"lion.task.approved",
		{ runId: string; planSlug: string; planPath: string; taskId: string }
	>("lion.task.approved"),

	taskRejected: createEvent<
		"lion.task.rejected",
		{ runId: string; planSlug: string; planPath: string; taskId: string; reason: string }
	>("lion.task.rejected"),

	taskMarkedComplete: createEvent<
		"lion.task.marked_complete",
		{ runId: string; planSlug: string; planPath: string; taskId: string }
	>("lion.task.marked_complete"),

	buildComplete: createEvent<
		"lion.build.complete",
		{ runId: string; planSlug: string; planPath: string; taskId: string; attempt: number; result: LionBuildResult }
	>("lion.build.complete"),

	buildFailed: createEvent<
		"lion.build.failed",
		{ runId: string; planSlug: string; planPath: string; taskId: string; attempt?: number; error: string }
	>("lion.build.failed"),

	ruleViolation: createEvent<
		"lion.rule.violation",
		{ runId: string; planSlug: string; planPath: string; taskId: string; rule: string; message: string }
	>("lion.rule.violation"),

	subagentEvent: createEvent<
		"lion.subagent.event",
		{ runId: string; planSlug: string; planPath: string; taskId: string; subagentEvent: SubAgentEvent }
	>("lion.subagent.event"),

	tasksStart: createEvent<
		"lion.tasks.start",
		{
			runId: string;
			planSlug: string;
			planPath: string;
			strategy: LionTaskStrategy;
			taskCount: number;
			concurrency?: number;
		}
	>("lion.tasks.start"),

	tasksComplete: createEvent<
		"lion.tasks.complete",
		{ runId: string; planSlug: string; planPath: string; result: LionTasksResult }
	>("lion.tasks.complete"),

	tasksTaskStart: createEvent<
		"lion.tasks.task.start",
		{
			runId: string;
			planSlug: string;
			planPath: string;
			index: number;
			title: string;
			definition: string;
		}
	>("lion.tasks.task.start"),

	tasksTaskEnd: createEvent<
		"lion.tasks.task.end",
		{
			runId: string;
			planSlug: string;
			planPath: string;
			index: number;
			title: string;
			definition: string;
			status: string;
			summary: string;
		}
	>("lion.tasks.task.end"),
} as const;

export type LionEventCreators = typeof LionEvents;
