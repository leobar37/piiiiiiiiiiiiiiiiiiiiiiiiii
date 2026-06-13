/**
 * Declarative event protocol between server and frontend.
 *
 * `ServerEvent` is the union of all events the server can emit to SSE
 * subscribers. Each event has a `type`, `sessionId`, `timestamp`, and a
 * payload specific to its type.
 */

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

// ============================================================================
// ServerEvent union
// ============================================================================

/** Payload for tool_execution_start */
export interface ToolExecutionStartPayload {
	toolCallId: string;
	toolName: string;
	args: unknown;
}

/** Payload for tool_execution_update */
export interface ToolExecutionUpdatePayload {
	toolCallId: string;
	toolName: string;
	args: unknown;
	partialResult: unknown;
}

/** Payload for tool_execution_end */
export interface ToolExecutionEndPayload {
	toolCallId: string;
	toolName: string;
	result: unknown;
	isError: boolean;
}

/** Payload for queue_update */
export interface QueueUpdatePayload {
	steering: readonly string[];
	followUp: readonly string[];
}

/** Payload for compaction_start */
export interface CompactionStartPayload {
	reason: "manual" | "threshold" | "overflow";
}

/** Payload for compaction_end */
export interface CompactionEndPayload {
	reason: "manual" | "threshold" | "overflow";
	aborted: boolean;
	willRetry: boolean;
	errorMessage?: string;
}

/** Payload for auto_retry_start */
export interface AutoRetryStartPayload {
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	errorMessage: string;
}

/** Payload for auto_retry_end */
export interface AutoRetryEndPayload {
	success: boolean;
	attempt: number;
	finalError?: string;
}

/** Payload for thinking_level_changed */
export interface ThinkingLevelChangedPayload {
	level: ThinkingLevel;
}

/** Payload for session_info_changed */
export interface SessionInfoChangedPayload {
	name: string | undefined;
}

/** Payload for subagent_start */
export interface SubagentStartPayload {
	id: string;
	parentId?: string;
	name: string;
	status: string;
}

/** Payload for subagent_end */
export interface SubagentEndPayload {
	id: string;
	result: unknown;
	status: string;
}

/** Payload for subagent_progress */
export interface SubagentProgressPayload {
	id: string;
	message: string;
	progress?: number;
}

/** Payload for subagent_error */
export interface SubagentErrorPayload {
	id: string;
	error: string;
}

/** Payload for message events (start, update, end) */
export interface MessagePayload {
	message: unknown; // AgentMessage serialized to JSON
	assistantMessageEvent?: unknown; // Only on message_update
}

/** Base fields every ServerEvent carries */
export interface ServerEventBase {
	sessionId: string;
	timestamp: number;
}

/** The full union of events the server can emit to the frontend */
export type ServerEvent =
	// Session lifecycle
	| (ServerEventBase & { type: "session_created" })
	| (ServerEventBase & { type: "session_started" })
	| (ServerEventBase & { type: "session_stopped" })
	| (ServerEventBase & { type: "session_removed" })
	// Agent events
	| (ServerEventBase & { type: "agent_start" })
	| (ServerEventBase & { type: "agent_end" })
	// Message lifecycle
	| (ServerEventBase & { type: "message_start"; message: unknown })
	| (ServerEventBase & { type: "message_update"; message: unknown; assistantMessageEvent: unknown })
	| (ServerEventBase & { type: "message_end"; message: unknown })
	// Tool execution
	| (ServerEventBase & { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown })
	| (ServerEventBase & {
			type: "tool_execution_update";
			toolCallId: string;
			toolName: string;
			args: unknown;
			partialResult: unknown;
	  })
	| (ServerEventBase & {
			type: "tool_execution_end";
			toolCallId: string;
			toolName: string;
			result: unknown;
			isError: boolean;
	  })
	// Queue
	| (ServerEventBase & { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] })
	// Compaction
	| (ServerEventBase & { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" })
	| (ServerEventBase & {
			type: "compaction_end";
			reason: "manual" | "threshold" | "overflow";
			aborted: boolean;
			willRetry: boolean;
			errorMessage?: string;
	  })
	// Block-level streaming (thinking, text deltas)
	| (ServerEventBase & { type: "thinking_start"; contentIndex: number })
	| (ServerEventBase & { type: "thinking_delta"; contentIndex: number; delta: string })
	| (ServerEventBase & { type: "thinking_end"; contentIndex: number; content: string })
	| (ServerEventBase & { type: "text_delta"; contentIndex: number; delta: string })
	| (ServerEventBase & { type: "toolcall_start"; contentIndex: number })
	| (ServerEventBase & { type: "toolcall_delta"; contentIndex: number; delta: string })
	| (ServerEventBase & { type: "toolcall_end"; contentIndex: number; toolCall: unknown })
	// Model / thinking
	| (ServerEventBase & { type: "thinking_level_changed"; level: ThinkingLevel })
	| (ServerEventBase & { type: "session_info_changed"; name: string | undefined })
	// Retry
	| (ServerEventBase & {
			type: "auto_retry_start";
			attempt: number;
			maxAttempts: number;
			delayMs: number;
			errorMessage: string;
	  })
	| (ServerEventBase & { type: "auto_retry_end"; success: boolean; attempt: number; finalError?: string })
	// Model select (from AgentEvent)
	| (ServerEventBase & {
			type: "model_select";
			payload: {
				provider: string;
				id: string;
				name: string;
				api: string;
				reasoning: boolean;
			};
	  })
	// Turn events
	| (ServerEventBase & { type: "turn_start" })
	| (ServerEventBase & { type: "turn_end" })
	// Subagent events
	| (ServerEventBase & { type: "subagent_start"; id: string; parentId?: string; name: string; status: string })
	| (ServerEventBase & { type: "subagent_end"; id: string; result: unknown; status: string })
	| (ServerEventBase & { type: "subagent_progress"; id: string; message: string; progress?: number })
	| (ServerEventBase & { type: "subagent_error"; id: string; error: string })
	// Ping (keep-alive)
	| (ServerEventBase & { type: "ping" });

// ============================================================================
// Event type string constants
// ============================================================================

export const SERVER_EVENT_TYPES = [
	"session_created",
	"session_started",
	"session_stopped",
	"session_removed",
	"agent_start",
	"agent_end",
	"message_start",
	"message_update",
	"message_end",
	"tool_execution_start",
	"tool_execution_update",
	"tool_execution_end",
	"thinking_start",
	"thinking_delta",
	"thinking_end",
	"text_delta",
	"toolcall_start",
	"toolcall_delta",
	"toolcall_end",
	"queue_update",
	"compaction_start",
	"compaction_end",
	"thinking_level_changed",
	"session_info_changed",
	"auto_retry_start",
	"auto_retry_end",
	"model_select",
	"turn_start",
	"turn_end",
	"subagent_start",
	"subagent_end",
	"subagent_progress",
	"subagent_error",
	"ping",
] as const;

export type ServerEventType = (typeof SERVER_EVENT_TYPES)[number];
