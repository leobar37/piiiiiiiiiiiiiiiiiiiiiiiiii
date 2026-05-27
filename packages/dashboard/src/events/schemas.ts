/**
 * Zod schemas for ServerEvent and related types.
 *
 * These schemas are used for oRPC input/output validation on the server
 * and can be consumed by the frontend for runtime data validation.
 */

import { z } from "zod";

// ============================================================================
// Event filter input
// ============================================================================

export const EventFilterSchema = z.object({
	sessionId: z.string().optional(),
	eventTypes: z.array(z.string()).optional(),
});

export type EventFilter = z.infer<typeof EventFilterSchema>;

// ============================================================================
// Server event schemas
// ============================================================================

const ServerEventBaseSchema = z.object({
	sessionId: z.string(),
	timestamp: z.number(),
});

export const ToolExecutionStartPayloadSchema = z.object({
	toolCallId: z.string(),
	toolName: z.string(),
	args: z.unknown(),
});

export const ToolExecutionUpdatePayloadSchema = z.object({
	toolCallId: z.string(),
	toolName: z.string(),
	args: z.unknown(),
	partialResult: z.unknown(),
});

export const ToolExecutionEndPayloadSchema = z.object({
	toolCallId: z.string(),
	toolName: z.string(),
	result: z.unknown(),
	isError: z.boolean(),
});

export const QueueUpdatePayloadSchema = z.object({
	steering: z.array(z.string()),
	followUp: z.array(z.string()),
});

export const CompactionStartPayloadSchema = z.object({
	reason: z.enum(["manual", "threshold", "overflow"]),
});

export const CompactionEndPayloadSchema = z.object({
	reason: z.enum(["manual", "threshold", "overflow"]),
	aborted: z.boolean(),
	willRetry: z.boolean(),
	errorMessage: z.string().optional(),
});

export const AutoRetryStartPayloadSchema = z.object({
	attempt: z.number(),
	maxAttempts: z.number(),
	delayMs: z.number(),
	errorMessage: z.string(),
});

export const AutoRetryEndPayloadSchema = z.object({
	success: z.boolean(),
	attempt: z.number(),
	finalError: z.string().optional(),
});

export const ServerEventSchema: z.ZodType<unknown> = z.union([
	// Session lifecycle
	ServerEventBaseSchema.extend({ type: z.literal("session_created") }),
	ServerEventBaseSchema.extend({ type: z.literal("session_started") }),
	ServerEventBaseSchema.extend({ type: z.literal("session_stopped") }),
	ServerEventBaseSchema.extend({ type: z.literal("session_removed") }),
	// Agent events
	ServerEventBaseSchema.extend({ type: z.literal("agent_start") }),
	ServerEventBaseSchema.extend({ type: z.literal("agent_end") }),
	// Message lifecycle
	ServerEventBaseSchema.extend({ type: z.literal("message_start"), message: z.unknown() }),
	ServerEventBaseSchema.extend({
		type: z.literal("message_update"),
		message: z.unknown(),
		assistantMessageEvent: z.unknown(),
	}),
	ServerEventBaseSchema.extend({ type: z.literal("message_end"), message: z.unknown() }),
	// Tool execution
	ServerEventBaseSchema.extend({
		type: z.literal("tool_execution_start"),
		toolCallId: z.string(),
		toolName: z.string(),
		args: z.unknown(),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("tool_execution_update"),
		toolCallId: z.string(),
		toolName: z.string(),
		args: z.unknown(),
		partialResult: z.unknown(),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("tool_execution_end"),
		toolCallId: z.string(),
		toolName: z.string(),
		result: z.unknown(),
		isError: z.boolean(),
	}),
	// Queue
	ServerEventBaseSchema.extend({
		type: z.literal("queue_update"),
		steering: z.array(z.string()),
		followUp: z.array(z.string()),
	}),
	// Compaction
	ServerEventBaseSchema.extend({
		type: z.literal("compaction_start"),
		reason: z.enum(["manual", "threshold", "overflow"]),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("compaction_end"),
		reason: z.enum(["manual", "threshold", "overflow"]),
		aborted: z.boolean(),
		willRetry: z.boolean(),
		errorMessage: z.string().optional(),
	}),
	// Model / thinking
	ServerEventBaseSchema.extend({ type: z.literal("thinking_level_changed"), level: z.string() }),
	ServerEventBaseSchema.extend({ type: z.literal("session_info_changed"), name: z.string().optional() }),
	// Retry
	ServerEventBaseSchema.extend({
		type: z.literal("auto_retry_start"),
		attempt: z.number(),
		maxAttempts: z.number(),
		delayMs: z.number(),
		errorMessage: z.string(),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("auto_retry_end"),
		success: z.boolean(),
		attempt: z.number(),
		finalError: z.string().optional(),
	}),
	// Other
	// Block-level streaming
	ServerEventBaseSchema.extend({
		type: z.literal("thinking_start"),
		contentIndex: z.number(),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("thinking_delta"),
		contentIndex: z.number(),
		delta: z.string(),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("thinking_end"),
		contentIndex: z.number(),
		content: z.string(),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("text_delta"),
		contentIndex: z.number(),
		delta: z.string(),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("toolcall_start"),
		contentIndex: z.number(),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("toolcall_delta"),
		contentIndex: z.number(),
		delta: z.string(),
	}),
	ServerEventBaseSchema.extend({
		type: z.literal("toolcall_end"),
		contentIndex: z.number(),
		toolCall: z.unknown(),
	}),
	// Other
	ServerEventBaseSchema.extend({
		type: z.literal("model_select"),
		payload: z.object({
			provider: z.string(),
			id: z.string(),
			name: z.string(),
			api: z.string(),
			reasoning: z.boolean(),
		}),
	}),
	ServerEventBaseSchema.extend({ type: z.literal("turn_start") }),
	ServerEventBaseSchema.extend({ type: z.literal("turn_end") }),
	// Ping
	ServerEventBaseSchema.extend({ type: z.literal("ping") }),
]);
