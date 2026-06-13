import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { DashboardCommand, DashboardModel, ThreadPromptImage, ThreadPromptMode } from "../api/session-control.js";
import type { LionEvent } from "../lion/types.js";
import type { SubAgentEvent, SubAgentInstanceState } from "../types.js";

export type DashboardThreadKind = "main" | "subagent";

export interface DashboardLionState {
	active: boolean;
	strategy: "plan" | "simple" | "review" | "none";
	phase: "planning" | "building";
	activePlanPath: string | null;
	activePlanSlug: string | null;
	planKind: "structured" | "overview" | null;
	activeTaskId: string | null;
	lastRunId: string | null;
}

export interface DashboardThreadState extends SubAgentInstanceState {
	kind: DashboardThreadKind;
	parentThreadId?: string;
	parentToolCallId?: string;
	runId?: string;
	runIndex?: number;
	orchestration?: {
		strategy: "plan" | "simple" | "review" | "none";
		planSlug?: string;
		planPath?: string;
	};
	isLive?: boolean;
	sessionFile?: string;
	sessionId?: string;
}

export interface DashboardSessionSource {
	getThread(): DashboardThreadState | null;
	getMessages(threadId: string): AgentMessage[] | null;
	getEvents(threadId: string): SubAgentEvent[];
	sendMessage?(threadId: string, message: string, mode: ThreadPromptMode, images?: ThreadPromptImage[]): Promise<void>;
	abort?(threadId: string): Promise<void> | void;
	getCommands?(threadId: string): Promise<DashboardCommand[]> | DashboardCommand[];
	getModels?(threadId: string): Promise<DashboardModel[]> | DashboardModel[];
	setModel?(threadId: string, provider: string, modelId: string): Promise<boolean>;
	subscribe(listener: (event: SubAgentEvent) => void): () => void;
}

export interface SubAgentTransport {
	readonly id: string;
	start(): Promise<void>;
	stop(): Promise<void>;
	emit(event: SubAgentTransportEvent): void;
}

export type SubAgentTransportEvent = SubAgentEvent | LionEvent;
