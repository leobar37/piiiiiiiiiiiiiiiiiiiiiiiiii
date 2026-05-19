import type { DelegationResult, DelegationStatus, SubAgentEvent } from "@local/pi-subagents";

export const LION_STATE_ENTRY_TYPE = "lion-state";
export const LION_MESSAGE_TYPE = "lion-message";
export const LION_DEFAULT_MAX_ATTEMPTS = 3;

export type LionMode = "planning" | "building";
export type LionPlanKind = "structured" | "overview";
export type LionTaskStatus = "pending" | "in_progress" | "complete" | "blocked";
export type LionReviewVerdict = "approved" | "rejected" | "unknown";
export type LionBuildStatus = "approved" | "rejected" | "failed";

export interface LionBuildResult {
	taskId: string;
	attempts: number;
	status: LionBuildStatus;
	executorSummary?: string;
	reviewerSummary?: string;
	error?: string;
}

export interface LionState {
	version: 1;
	active: boolean;
	mode: LionMode;
	activePlanPath: string | null;
	activePlanSlug: string | null;
	planKind: LionPlanKind | null;
	activeTaskId: string | null;
	maxAttempts: number;
	lastRunId: string | null;
	lastBuild?: LionBuildResult;
}

export interface PersistedLionState extends LionState {
	action: "activate" | "mode" | "build" | "clear";
	updatedAt: number;
}

export interface LionTask {
	id: string;
	title: string;
	file: string;
	status: LionTaskStatus;
	dependencies: string[];
	requirements: string[];
	phase?: string;
}

export interface LionPlan {
	kind: LionPlanKind;
	slug: string;
	rootPath: string;
	contextFile?: string;
	requirementsFile?: string;
	indexFile: string;
	checklistFile?: string;
	tasks: LionTask[];
}

export interface LionPlanContent {
	context: string;
	requirements: string;
	taskIndex: string;
	taskBrief: string;
}

export interface LionPipelineConfig {
	maxAttempts: number;
}

export interface LionDelegationRunResult {
	result: DelegationResult;
	summary: string;
	status: DelegationStatus;
}

export interface LionDelegationRunner {
	runExecutor(prompt: string, attempt: number): Promise<LionDelegationRunResult>;
	runReviewer(prompt: string, attempt: number): Promise<LionDelegationRunResult>;
}

export interface LionPipelineOptions {
	runId: string;
	plan: LionPlan;
	task: LionTask;
	content: LionPlanContent;
	config: LionPipelineConfig;
	runner: LionDelegationRunner;
	emit?: LionEventSink;
}

export interface LionPipelineAttempt {
	attempt: number;
	executorSummary: string;
	reviewerSummary: string;
	verdict: LionReviewVerdict;
}

export type LionEventType = keyof LionEventMap;
export type LionEvent = LionEventMap[LionEventType];
export type LionEventSink = (event: LionEvent) => void;

export interface LionEventBase {
	type: LionEventType;
	timestamp: number;
	runId: string;
	planSlug?: string;
	planPath?: string;
	taskId?: string;
	attempt?: number;
}

export interface LionEventMap {
	"lion.activate.start": LionEventBase & { type: "lion.activate.start"; input?: string };
	"lion.activate.complete": LionEventBase & { type: "lion.activate.complete"; mode: LionMode };
	"lion.plan.loaded": LionEventBase & { type: "lion.plan.loaded"; taskCount: number; kind: LionPlanKind };
	"lion.mode.changed": LionEventBase & { type: "lion.mode.changed"; mode: LionMode };
	"lion.build.start": LionEventBase & { type: "lion.build.start" };
	"lion.task.selected": LionEventBase & { type: "lion.task.selected"; title: string };
	"lion.delegation.prompt.created": LionEventBase & {
		type: "lion.delegation.prompt.created";
		agent: "executor" | "reviewer";
		promptLength: number;
	};
	"lion.delegation.start": LionEventBase & { type: "lion.delegation.start"; agent: "executor" | "reviewer" };
	"lion.delegation.end": LionEventBase & {
		type: "lion.delegation.end";
		agent: "executor" | "reviewer";
		status: string;
		summary: string;
	};
	"lion.review.verdict": LionEventBase & {
		type: "lion.review.verdict";
		verdict: LionReviewVerdict;
		summary: string;
	};
	"lion.correction.requested": LionEventBase & { type: "lion.correction.requested"; feedback: string };
	"lion.task.approved": LionEventBase & { type: "lion.task.approved" };
	"lion.task.rejected": LionEventBase & { type: "lion.task.rejected"; reason: string };
	"lion.task.marked_complete": LionEventBase & { type: "lion.task.marked_complete" };
	"lion.build.complete": LionEventBase & { type: "lion.build.complete"; result: LionBuildResult };
	"lion.build.failed": LionEventBase & { type: "lion.build.failed"; error: string };
	"lion.rule.violation": LionEventBase & { type: "lion.rule.violation"; rule: string; message: string };
	"lion.subagent.event": LionEventBase & { type: "lion.subagent.event"; subagentEvent: SubAgentEvent };
}
