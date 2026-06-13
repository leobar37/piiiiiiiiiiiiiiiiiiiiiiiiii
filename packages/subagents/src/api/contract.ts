import { oc } from "@orpc/contract";
import { z } from "zod";
import {
	AgentMessageSchema,
	ChecklistInputSchema,
	DashboardCommandSchema,
	DashboardLionStateSchema,
	DashboardLogEntrySchema,
	DashboardLogQuerySchema,
	DashboardLogSessionSummarySchema,
	DashboardModelSchema,
	DashboardTaskSchema,
	DashboardThreadStateSchema,
	LionChecklistSnapshotSchema,
	LionSetStrategyInputSchema,
	LionSetStrategyResultSchema,
	SubAgentEventSchema,
	SubAgentRunRecordSchema,
	TaskBlockInputSchema,
	TaskCreateInputSchema,
	TaskIdInputSchema,
	TaskListInputSchema,
	TaskMutationResultSchema,
	TaskUpdateInputSchema,
	ThreadAbortInputSchema,
	ThreadCreateInputSchema,
	ThreadCreateResultSchema,
	ThreadIdInputSchema,
	ThreadModelInputSchema,
	ThreadModelResultSchema,
	ThreadPromptInputSchema,
	ThreadPromptResultSchema,
} from "./schemas.js";

/**
 * ORPC contract for the subagents dashboard API.
 *
 * Defines every backend capability currently consumed by the frontend.
 * Implementation lives in src/api/router.ts (T-002).
 */
export const subagentsContract = oc.router({
	threads: {
		list: oc.output(z.array(DashboardThreadStateSchema)),

		create: oc.input(ThreadCreateInputSchema).output(ThreadCreateResultSchema),

		get: oc.input(ThreadIdInputSchema).output(DashboardThreadStateSchema),

		session: oc.input(ThreadIdInputSchema).output(
			z.object({
				sessionId: z.string(),
				messages: z.array(AgentMessageSchema),
			}),
		),

		messages: oc.input(ThreadIdInputSchema).output(z.array(AgentMessageSchema)),

		events: oc.input(ThreadIdInputSchema).output(z.array(SubAgentEventSchema)),

		run: oc.input(ThreadIdInputSchema).output(SubAgentRunRecordSchema.nullable()),

		prompt: oc.input(ThreadPromptInputSchema).output(ThreadPromptResultSchema),

		abort: oc.input(ThreadAbortInputSchema).output(ThreadIdInputSchema),

		commands: oc.input(ThreadIdInputSchema).output(z.array(DashboardCommandSchema)),

		models: oc.input(ThreadIdInputSchema).output(z.array(DashboardModelSchema)),

		model: oc.input(ThreadModelInputSchema).output(ThreadModelResultSchema),
	},

	lion: {
		state: oc.output(DashboardLionStateSchema),

		setStrategy: oc.input(LionSetStrategyInputSchema).output(LionSetStrategyResultSchema),

		checklist: oc.input(ChecklistInputSchema).output(LionChecklistSnapshotSchema),
	},

	tasks: {
		list: oc.input(TaskListInputSchema).output(z.array(DashboardTaskSchema)),

		get: oc.input(TaskIdInputSchema).output(DashboardTaskSchema.nullable()),

		create: oc.input(TaskCreateInputSchema).output(TaskMutationResultSchema),

		update: oc.input(TaskUpdateInputSchema).output(TaskMutationResultSchema),

		complete: oc
			.input(TaskUpdateInputSchema.pick({ id: true, actorSessionId: true, expectedRevision: true }))
			.output(TaskMutationResultSchema),

		block: oc.input(TaskBlockInputSchema).output(TaskMutationResultSchema),

		delete: oc
			.input(TaskUpdateInputSchema.pick({ id: true, actorSessionId: true, expectedRevision: true }))
			.output(TaskMutationResultSchema),
	},

	logs: {
		session: oc.input(DashboardLogQuerySchema).output(z.array(DashboardLogEntrySchema)),

		list: oc.output(z.array(DashboardLogSessionSummarySchema)),
	},
});

export type SubagentsContract = typeof subagentsContract;
