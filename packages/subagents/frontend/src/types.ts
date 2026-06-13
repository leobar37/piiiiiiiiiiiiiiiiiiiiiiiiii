// Types mirroring pi-subagents backend types for the frontend

export type SubAgentState =
	| "created"
	| "starting"
	| "running"
	| "paused"
	| "completing"
	| "completed"
	| "blocked"
	| "failed"
	| "cancelled"
	| "timed_out"
	| "queued";

export interface SubAgentInstanceState {
	instanceId: string;
	taskId: string;
	definitionName: string;
	cwd: string;
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
	strategy: "plan" | "simple" | "review" | "none";
	planSlug?: string;
	planPath?: string;
}

export interface LionDashboardState {
	active: boolean;
	strategy: "plan" | "simple" | "review" | "none";
	phase: "planning" | "building";
	activePlanPath: string | null;
	activePlanSlug: string | null;
	planKind: "structured" | "overview" | null;
	activeTaskId: string | null;
	lastRunId: string | null;
}

export type LionChecklistKind = "plan" | "review";
export type LionTaskStatus = "pending" | "in_progress" | "complete" | "blocked" | "retryable";

export interface LionChecklistTask {
	id: string;
	title: string;
	file: string;
	status: LionTaskStatus;
	dependencies: string[];
	requirements: string[];
	phase?: string;
	scope?: string[];
	kind?: string;
	last_summary?: string;
	updated_at?: string;
}

export interface LionChecklistProgress {
	completed: number;
	total: number;
	pending: number;
	inProgress: number;
	blocked: number;
	retryable: number;
	percent: number;
}

export interface LionChecklistSnapshot {
	kind: LionChecklistKind;
	slug: string;
	rootPath: string;
	checklistFile: string;
	tasks: LionChecklistTask[];
	progress: LionChecklistProgress;
	updatedAt: string | null;
}

export type TaskStatus = "pending" | "in_progress" | "blocked" | "completed" | "deleted";

export interface TaskContext {
	why?: string;
	files?: string[];
	doneWhen?: string[];
	notes?: string;
}

export interface TaskRecord {
	id: string;
	title: string;
	status: TaskStatus;
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
	revision: number;
	assignedToSession?: string;
	context?: TaskContext;
}

export interface SubAgentEvent {
	type: string;
	timestamp: number;
	instanceId?: string;
	taskId?: string;
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

export interface DashboardModel {
	provider: string;
	id: string;
	name: string;
	api: string;
	reasoning: boolean;
}

export interface DashboardImageAttachment {
	type: "image";
	data: string;
	mimeType: string;
	name?: string;
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
	| "session.event"
	| "session.message.complete"
	| "session.snapshot"
	| "task.changed";

// =============================================================================
// Message blocks — normalized representation of message content
// =============================================================================

export type MessageBlock =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string; signature?: string; redacted?: boolean }
	| { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
	| { type: "toolResult"; toolCallId: string; toolName?: string; content: string; isError: boolean }
	| { type: "image"; data: string; mimeType: string };

export interface ChatMessage {
	id: string;
	instanceId: string;
	role: "user" | "assistant" | "tool" | "system";
	blocks: MessageBlock[];
	timestamp: number;
	streaming?: boolean;
	partial?: boolean;
	optimistic?: boolean;
	stopReason?: string;
	errorMessage?: string;
}
