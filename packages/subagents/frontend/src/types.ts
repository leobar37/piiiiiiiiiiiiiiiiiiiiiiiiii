// Types mirroring pi-subagents backend types for the frontend

export type SubAgentState =
	| "created"
	| "starting"
	| "running"
	| "paused"
	| "completing"
	| "completed"
	| "failed"
	| "cancelled"
	| "timed_out"
	| "queued";

export interface SubAgentInstanceState {
	instanceId: string;
	taskId: string;
	definitionName: string;
	kind?: "main" | "subagent";
	parentThreadId?: string;
	parentToolCallId?: string;
	runId?: string;
	runIndex?: number;
	description?: string;
	state: SubAgentState;
	startTime: number | null;
	endTime: number | null;
	turnCount: number;
	lastActivityAt: number;
	currentTool: string | null;
	error: string | null;
	toolCount: number;
	currentToolStartedAt: number | null;
	durationMs: number;
	isLive?: boolean;
	sessionFile?: string;
	sessionId?: string;
	modelProvider?: string;
	modelId?: string;
}

export interface SubAgentEvent {
	type: string;
	timestamp: number;
	instanceId: string;
	taskId: string;
	[key: string]: unknown;
}

export type SubAgentEventType =
	| "lifecycle.change"
	| "task.start"
	| "task.end"
	| "turn.complete"
	| "tool.start"
	| "tool.end"
	| "tool.execute"
	| "progress.update"
	| "query.response"
	| "summary.available"
	| "error"
	| "instance.created"
	| "instance.state"
	| "instance.session"
	| "session.event";

// =============================================================================
// Message blocks — normalized representation of message content
// =============================================================================

export type MessageBlock =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string; signature?: string; redacted?: boolean }
	| { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
	| { type: "toolResult"; toolCallId: string; content: string; isError: boolean }
	| { type: "image"; data: string; mimeType: string };

export interface ChatMessage {
	id: string;
	instanceId: string;
	role: "user" | "assistant" | "tool" | "system";
	blocks: MessageBlock[];
	timestamp: number;
	streaming?: boolean;
	partial?: boolean;
}
