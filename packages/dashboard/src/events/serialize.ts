/**
 * Serialize internal AgentSessionEvent to the declarative ServerEvent format.
 *
 * This module provides a single function `serializeAgentSessionEvent` that
 * converts runtime events from the coding-agent into JSON-serializable
 * events that can be emitted to the frontend via SSE.
 */

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ServerEvent } from "./types.js";

/**
 * Convert an `AgentSessionEvent` from the coding-agent runtime into a
 * `ServerEvent` suitable for SSE transmission to the frontend.
 */
export function serializeAgentSessionEvent(event: AgentSessionEvent, sessionId: string): ServerEvent {
	const base = { sessionId, timestamp: Date.now() };

	switch (event.type) {
		// Agent lifecycle
		case "agent_start":
			return { ...base, type: "agent_start" };
		case "agent_end":
			return { ...base, type: "agent_end" };
		// Turn lifecycle
		case "turn_start":
			return { ...base, type: "turn_start" };
		case "turn_end":
			return { ...base, type: "turn_end" };
		// Message lifecycle
		case "message_start":
			return { ...base, type: "message_start", message: event.message };
		case "message_update": {
			// Also emit block-level events from the assistantMessageEvent for granular streaming
			const ame = event.assistantMessageEvent as Record<string, unknown> | undefined;
			if (ame && typeof ame.type === "string") {
				switch (ame.type) {
					case "thinking_start":
						return {
							...base,
							type: "thinking_start",
							contentIndex: (ame.contentIndex as number) ?? 0,
						};
					case "thinking_delta":
						return {
							...base,
							type: "thinking_delta",
							contentIndex: (ame.contentIndex as number) ?? 0,
							delta: (ame.delta as string) ?? "",
						};
					case "thinking_end":
						return {
							...base,
							type: "thinking_end",
							contentIndex: (ame.contentIndex as number) ?? 0,
							content: (ame.content as string) ?? "",
						};
					case "text_delta":
						return {
							...base,
							type: "text_delta",
							contentIndex: (ame.contentIndex as number) ?? 0,
							delta: (ame.delta as string) ?? "",
						};
					case "toolcall_start":
						return {
							...base,
							type: "toolcall_start",
							contentIndex: (ame.contentIndex as number) ?? 0,
						};
					case "toolcall_delta":
						return {
							...base,
							type: "toolcall_delta",
							contentIndex: (ame.contentIndex as number) ?? 0,
							delta: (ame.delta as string) ?? "",
						};
					case "toolcall_end":
						return {
							...base,
							type: "toolcall_end",
							contentIndex: (ame.contentIndex as number) ?? 0,
							toolCall: (ame.toolCall as unknown) ?? null,
						};
				}
			}
			return {
				...base,
				type: "message_update",
				message: event.message,
				assistantMessageEvent: event.assistantMessageEvent,
			};
		}
		case "message_end":
			return { ...base, type: "message_end", message: event.message };
		// Tool execution
		case "tool_execution_start":
			return {
				...base,
				type: "tool_execution_start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
			};
		case "tool_execution_update":
			return {
				...base,
				type: "tool_execution_update",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				args: event.args,
				partialResult: event.partialResult,
			};
		case "tool_execution_end":
			return {
				...base,
				type: "tool_execution_end",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				result: event.result,
				isError: event.isError,
			};
		// Queue
		case "queue_update":
			return { ...base, type: "queue_update", steering: event.steering, followUp: event.followUp };
		// Compaction
		case "compaction_start":
			return { ...base, type: "compaction_start", reason: event.reason };
		case "compaction_end":
			return {
				...base,
				type: "compaction_end",
				reason: event.reason,
				aborted: event.aborted,
				willRetry: event.willRetry,
				errorMessage: event.errorMessage,
			};
		// Model / thinking
		case "thinking_level_changed":
			return { ...base, type: "thinking_level_changed", level: event.level };
		case "session_info_changed":
			return { ...base, type: "session_info_changed", name: event.name };
		case "model_select": {
			const model = event.model as unknown as Record<string, unknown>;
			return {
				...base,
				type: "model_select",
				payload: {
					provider: String(model.provider ?? ""),
					id: String(model.id ?? ""),
					name: String(model.name ?? ""),
					api: String(model.api ?? ""),
					reasoning: Boolean(model.reasoning ?? false),
				},
			};
		}
		// Retry
		case "auto_retry_start":
			return {
				...base,
				type: "auto_retry_start",
				attempt: event.attempt,
				maxAttempts: event.maxAttempts,
				delayMs: event.delayMs,
				errorMessage: event.errorMessage,
			};
		case "auto_retry_end":
			return {
				...base,
				type: "auto_retry_end",
				success: event.success,
				attempt: event.attempt,
				finalError: event.finalError,
			};
		// Catch-all for unknown event types
		default: {
			// Unknown event type — log and return a safe generic event
			console.warn(
				`[serializeAgentSessionEvent] Unknown event type: ${(event as Record<string, unknown>).type ?? "undefined"}`,
			);
			return { ...base, type: "ping" as const };
		}
	}
}

/**
 * Create a ping event for keep-alive.
 */
export function createPingEvent(sessionId = ""): ServerEvent {
	return { sessionId, timestamp: Date.now(), type: "ping" };
}
