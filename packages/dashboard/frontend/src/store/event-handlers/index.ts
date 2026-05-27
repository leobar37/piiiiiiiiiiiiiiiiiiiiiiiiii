import type { ServerEvent } from "@local/pi-dashboard";
import type { SessionRuntime } from "../runtime.js";
import type { EventHandler } from "./types.js";
import {
	handleSessionStarted,
	handleSessionStopped,
	handleSessionRemoved,
	handleSessionCreated,
} from "./session-lifecycle.js";
import { handleAgentStart, handleAgentEnd } from "./agent-lifecycle.js";
import { handleMessageStart, handleMessageUpdate, handleMessageEnd } from "./message-lifecycle.js";
import {
	handleThinkingStart,
	handleThinkingDelta,
	handleThinkingEnd,
	handleTextDelta,
	handleToolcallStart,
	handleToolcallDelta,
	handleToolcallEnd,
} from "./block-streaming.js";
import { handleModelSelect } from "./model-lifecycle.js";
import { handleToolExecutionStart, handleToolExecutionUpdate, handleToolExecutionEnd } from "./tool-execution.js";
import {
	handleQueueUpdate,
	handleCompactionStart,
	handleCompactionEnd,
	handleAutoRetryStart,
	handleAutoRetryEnd,
} from "./queue-compaction.js";
import { handleSessionInfoChanged } from "./session-info.js";

export const HANDLERS: Record<string, EventHandler | undefined> = {
	session_started: handleSessionStarted,
	session_stopped: handleSessionStopped,
	session_removed: handleSessionRemoved,
	agent_start: handleAgentStart,
	agent_end: handleAgentEnd,
	message_start: handleMessageStart,
	message_update: handleMessageUpdate,
	message_end: handleMessageEnd,
	thinking_start: handleThinkingStart,
	thinking_delta: handleThinkingDelta,
	thinking_end: handleThinkingEnd,
	text_delta: handleTextDelta,
	toolcall_start: handleToolcallStart,
	toolcall_delta: handleToolcallDelta,
	toolcall_end: handleToolcallEnd,
	tool_execution_start: handleToolExecutionStart,
	tool_execution_update: handleToolExecutionUpdate,
	tool_execution_end: handleToolExecutionEnd,
	queue_update: handleQueueUpdate,
	compaction_start: handleCompactionStart,
	compaction_end: handleCompactionEnd,
	auto_retry_start: handleAutoRetryStart,
	auto_retry_end: handleAutoRetryEnd,
	session_info_changed: handleSessionInfoChanged,
	session_created: handleSessionCreated,
	model_select: handleModelSelect,
};

/**
 * Applies a server event to the runtime state.
 * Pure dispatcher — each handler has a single responsibility.
 * All mutations go through the Jotai store.
 */
export function applyEvent(runtime: SessionRuntime, event: ServerEvent): void {
	const handler = HANDLERS[event.type];
	if (handler) {
		handler(runtime, event);
		return;
	}
	// Explicit no-ops: these event types are intentionally ignored
	const explicitNoOps = new Set<string>([
		"ping",
		"thinking_level_changed",
		"turn_start",
		"turn_end",
	]);
	if (!explicitNoOps.has(event.type)) {
		console.warn(`[applyEvent] Unhandled event type: ${event.type}`);
	}
}
