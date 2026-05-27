/**
 * Zod schemas for the dashboard API.
 */

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import type { LiveSessionInfo, SessionStatus } from "../session/types.js";

// ============================================================================
// Session schemas
// ============================================================================

export const SessionStatusSchema = z.enum([
	"created",
	"starting",
	"idle",
	"streaming",
	"error",
	"stopped",
]) satisfies z.ZodType<SessionStatus>;

export const SessionInfoSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	status: SessionStatusSchema,
	isActive: z.boolean(),
	sessionFile: z.string().optional(),
	cwd: z.string(),
	createdAt: z.number(),
	lastActivityAt: z.number(),
	messageCount: z.number(),
}) satisfies z.ZodType<LiveSessionInfo>;

export const SessionStateSchema = z.object({
	status: SessionStatusSchema,
	isStreaming: z.boolean(),
	isCompacting: z.boolean(),
	pendingMessageCount: z.number(),
	messageCount: z.number(),
});

export const SessionEventSchema = z
	.object({
		type: z.string(),
	})
	.passthrough() as z.ZodType<AgentSessionEvent>;

export const ModelInfoSchema = z.object({
	provider: z.string(),
	id: z.string(),
	name: z.string(),
	api: z.string(),
	reasoning: z.boolean(),
});
