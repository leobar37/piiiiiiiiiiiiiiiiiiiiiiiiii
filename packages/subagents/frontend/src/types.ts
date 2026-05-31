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
	orchestration?: SubAgentOrchestrationContext;
}

export interface SubAgentOrchestrationContext {
	strategy: "plan" | "simple";
	planSlug?: string;
	planPath?: string;
}

export interface LionDashboardState {
	active: boolean;
	strategy: "plan" | "simple";
	phase: "planning" | "building";
	activePlanPath: string | null;
	activePlanSlug: string | null;
	planKind: "structured" | "overview" | null;
	activeTaskId: string | null;
	lastRunId: string | null;
}

export interface SubAgentEvent {
	type: string;
	timestamp: number;
	instanceId: string;
	taskId: string;
	[key: string]: unknown;
}

export interface SubAgentRunRecord {
	version: 1;
	sessionId: string;
	taskId: string;
	instanceId: string;
	definitionName: string;
	cwd: string;
	parentThreadId?: string;
	parentToolCallId?: string;
	runId?: string;
	runIndex?: number;
	description?: string;
	prompt: string;
	systemPrompt?: string;
	modelProvider?: string;
	modelId?: string;
	status: "running" | "completed" | "failed" | "blocked" | "timed_out" | "cancelled";
	summary?: string;
	error?: string;
	startedAt: number;
	updatedAt: number;
	completedAt?: number;
	turnCount: number;
	toolCount: number;
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
