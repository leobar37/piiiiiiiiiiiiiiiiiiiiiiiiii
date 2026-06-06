import { oc } from "@orpc/contract";
import { z } from "zod";
import {
	AgentMessageSchema,
	ChecklistInputSchema,
	DashboardCommandSchema,
	DashboardLionStateSchema,
	DashboardThreadStateSchema,
	LionChecklistSnapshotSchema,
	SubAgentEventSchema,
	SubAgentRunRecordSchema,
	ThreadIdInputSchema,
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

		commands: oc.input(ThreadIdInputSchema).output(z.array(DashboardCommandSchema)),
	},

	lion: {
		state: oc.output(DashboardLionStateSchema),

		checklist: oc.input(ChecklistInputSchema).output(LionChecklistSnapshotSchema),
	},
});

export type SubagentsContract = typeof subagentsContract;
