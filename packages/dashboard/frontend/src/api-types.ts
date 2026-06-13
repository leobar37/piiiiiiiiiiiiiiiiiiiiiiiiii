/**
 * Typed API client interfaces for the dashboard frontend.
 *
 * These types mirror the oRPC router structure and are used to type
 * the client-side API calls without relying on `any` casts.
 */

import type { SessionInfo, SessionStatus, ServerEvent } from "./orpc.js";

// ============================================================================
// Dashboard procedures
// ============================================================================

export interface DashboardState {
	uptime: number;
	subscriberCount: number;
}

export interface LogEntry {
	timestamp: string;
	level: "debug" | "info" | "warn" | "error";
	message: string;
	context?: Record<string, unknown>;
}

export interface LogsInput {
	level?: "debug" | "info" | "warn" | "error";
	limit?: number;
	sessionId?: string;
}

export interface LogsOutput {
	logs: LogEntry[];
	total: number;
}

export interface EventFilterInput {
	sessionId?: string;
	eventTypes?: string[];
}

// ============================================================================
// Project procedures
// ============================================================================

export interface ProjectInfo {
	id: string;
	name: string;
	defaultCwd?: string;
	createdAt: number;
	updatedAt: number;
	archivedAt?: number;
	sessionCount: number;
	lastActivityAt?: number;
}

export interface ListProjectsOutput {
	projects: ProjectInfo[];
}

export interface CreateProjectInput {
	name?: string;
	defaultCwd?: string;
}

export interface CreateProjectOutput {
	project: ProjectInfo;
}

export interface UpdateProjectInput {
	projectId: string;
	name?: string;
	defaultCwd?: string | null;
}

export interface ArchiveProjectInput {
	projectId: string;
}

// ============================================================================
// Session procedures
// ============================================================================

export interface ListSessionsInput {
	cwd?: string;
	projectId?: string;
	scope?: "global" | "project";
}

export interface ListSessionsOutput {
	sessions: SessionInfo[];
}

export interface CreateSessionInput {
	projectId: string;
	cwd?: string;
}

export interface CreateSessionOutput {
	session: SessionInfo;
}

export interface GetSessionInput {
	sessionId: string;
}

export interface GetSessionOutput {
	session: SessionInfo;
}

export interface RemoveSessionInput {
	sessionId: string;
}

export interface RemoveSessionOutput {
	success: boolean;
}

export interface OpenSessionInput {
	sessionFile: string;
	cwdOverride?: string;
}

export interface ContinueRecentInput {
	cwd?: string;
}

export interface StartSessionInput {
	sessionId: string;
}

export interface StopSessionInput {
	sessionId: string;
}

export interface PromptInput {
	sessionId: string;
	message: string;
	streamingBehavior?: "steer" | "followUp";
}

export interface SteerInput {
	sessionId: string;
	message: string;
}

export interface FollowUpInput {
	sessionId: string;
	message: string;
}

export interface AbortInput {
	sessionId: string;
}

export interface MoveSessionInput {
	sessionId: string;
	projectId: string;
}

export interface SuccessOutput {
	success: boolean;
}

export interface GetStateInput {
	sessionId: string;
}

export interface SessionStateOutput {
	status: SessionStatus;
	isStreaming: boolean;
	isCompacting: boolean;
	pendingMessageCount: number;
	messageCount: number;
}

export interface GetMessagesInput {
	sessionId: string;
}

export interface GetMessagesOutput {
	messages: Array<Record<string, unknown>>;
}

// ============================================================================
// Model procedures
// ============================================================================

export interface ModelInfo {
	provider: string;
	id: string;
	name: string;
	api: string;
	reasoning: boolean;
}

export interface ListModelsInput {
	sessionId?: string;
}

export interface ListModelsOutput {
	models: ModelInfo[];
	current?: ModelInfo;
}

export interface SetModelInput {
	sessionId: string;
	provider: string;
	modelId: string;
}

// ============================================================================
// Client interface
// ============================================================================

export interface DashboardClient {
	state: {
		get(): Promise<DashboardState>;
	};
	events: {
		stream(input: EventFilterInput): AsyncIterableIterator<ServerEvent>;
	};
	logs: {
		get(input?: LogsInput): Promise<LogsOutput>;
	};
	projects: {
		list(input?: Record<string, never>): Promise<ListProjectsOutput>;
		create(input: CreateProjectInput): Promise<CreateProjectOutput>;
		update(input: UpdateProjectInput): Promise<CreateProjectOutput>;
		archive(input: ArchiveProjectInput): Promise<SuccessOutput>;
	};
	sessions: {
		list(input?: ListSessionsInput): Promise<ListSessionsOutput>;
		create(input: CreateSessionInput): Promise<CreateSessionOutput>;
		get(input: GetSessionInput): Promise<GetSessionOutput>;
		remove(input: RemoveSessionInput): Promise<RemoveSessionOutput>;
		open(input: OpenSessionInput): Promise<CreateSessionOutput>;
		continueRecent(input?: ContinueRecentInput): Promise<CreateSessionOutput>;
		start(input: StartSessionInput): Promise<SuccessOutput>;
		stop(input: StopSessionInput): Promise<SuccessOutput>;
		prompt(input: PromptInput): Promise<SuccessOutput>;
		steer(input: SteerInput): Promise<SuccessOutput>;
		followUp(input: FollowUpInput): Promise<SuccessOutput>;
		abort(input: AbortInput): Promise<SuccessOutput>;
		move(input: MoveSessionInput): Promise<CreateSessionOutput>;
		state: {
			get(input: GetStateInput): Promise<SessionStateOutput>;
		};
		messages: {
			get(input: GetMessagesInput): Promise<GetMessagesOutput>;
		};
		models: {
			list(input?: ListModelsInput): Promise<ListModelsOutput>;
			set(input: SetModelInput): Promise<SuccessOutput>;
		};
	};
}
