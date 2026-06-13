import type { DelegationStatus, RecordSubAgentResultInput, SubAgentEvent } from "../types.js";

export type LionTaskStrategy = "parallel" | "sequential" | "chain";

export interface LionTaskConfig {
	definition: string;
	title: string;
	prompt: string;
	capabilities?: Partial<{
		canEdit: boolean;
		canWrite: boolean;
		canExecute: boolean;
		canResearch: boolean;
	}>;
}

export interface LionTaskResult {
	taskId: string;
	title: string;
	definition: string;
	status: DelegationStatus;
	verificationStatus: LionVerificationStatus;
	evidence: LionTaskEvidence;
	summary: string;
	recordedResult?: RecordSubAgentResultInput;
	duration: number;
	turnCount: number;
	error?: string;
}

export interface LionTasksResult {
	runId: string;
	strategy: LionTaskStrategy;
	tasks: LionTaskResult[];
	completedCount: number;
	failedCount: number;
	completedAt: number;
}

export const LION_DEFAULT_MAX_ATTEMPTS = 3;

export type LionStrategyName = "plan" | "simple" | "review" | "none";
export type LionPhase = "planning" | "building";
export type LionPlanKind = "structured" | "overview";
export type LionTaskStatus = "pending" | "in_progress" | "complete" | "blocked" | "retryable";
export type LionChecklistKind = "plan" | "review";
export type LionReviewVerdict = "approved" | "rejected" | "unknown";
export type LionBuildStatus = "approved" | "rejected" | "failed";
export type LionVerificationStatus = "verified" | "failed" | "blocked" | "unverified";

export interface LionTaskEvidence {
	commands: LionCommandEvidence[];
	checks: LionCheckEvidence[];
	changedFiles: string[];
	warnings: string[];
	externalFailures: string[];
	residualRisks: string[];
}

export interface LionCommandEvidence {
	command: string;
	cwd?: string;
	exitCode?: number;
	status: "passed" | "failed" | "blocked" | "unknown";
	stdoutSnippet?: string;
	stderrSnippet?: string;
	durationMs?: number;
}

export interface LionCheckEvidence {
	name: string;
	status: "passed" | "failed" | "blocked" | "not_run" | "unknown";
	detail?: string;
}

export interface LionBuildResult {
	taskId: string;
	attempts: number;
	status: LionBuildStatus;
	executorSummary?: string;
	reviewerSummary?: string;
	error?: string;
}

export interface LionState {
	version: 2;
	active: boolean;
	strategy: LionStrategyName;
	phase: LionPhase;
	activePlanPath: string | null;
	activePlanSlug: string | null;
	planKind: LionPlanKind | null;
	activeTaskId: string | null;
	maxAttempts: number;
	lastRunId: string | null;
	lastBuild?: LionBuildResult;
}

export interface LionTask {
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
	tasks: LionTask[];
	progress: LionChecklistProgress;
	updatedAt: string | null;
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

export type LionDelegationAgent = "analyzer" | "planner" | "executor" | "reviewer" | "validator";

export type LionEventType = keyof LionEventMap;
export type LionEvent = LionEventMap[LionEventType];

export interface LionEventBase {
	id?: string;
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
	"lion.activate.complete": LionEventBase & {
		type: "lion.activate.complete";
		strategy: LionStrategyName;
		phase: LionPhase;
	};
	"lion.plan.loaded": LionEventBase & { type: "lion.plan.loaded"; taskCount: number; kind: LionPlanKind };
	"lion.mode.changed": LionEventBase & {
		type: "lion.mode.changed";
		strategy: LionStrategyName;
		phase: LionPhase;
	};
	"lion.build.start": LionEventBase & { type: "lion.build.start" };
	"lion.task.selected": LionEventBase & { type: "lion.task.selected"; title: string };
	"lion.delegation.prompt.created": LionEventBase & {
		type: "lion.delegation.prompt.created";
		agent: LionDelegationAgent;
		promptLength: number;
	};
	"lion.delegation.start": LionEventBase & { type: "lion.delegation.start"; agent: LionDelegationAgent };
	"lion.delegation.end": LionEventBase & {
		type: "lion.delegation.end";
		agent: LionDelegationAgent;
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
	"lion.subagent.event": LionEventBase & { type: "lion.subagent.event"; subagentEvent: SubAgentEvent };
	"lion.tasks.start": LionEventBase & {
		type: "lion.tasks.start";
		strategy: LionTaskStrategy;
		taskCount: number;
		concurrency?: number;
	};
	"lion.tasks.complete": LionEventBase & {
		type: "lion.tasks.complete";
		result: LionTasksResult;
	};
	"lion.tasks.task.start": LionEventBase & {
		type: "lion.tasks.task.start";
		index: number;
		title: string;
		definition: string;
	};
	"lion.tasks.task.end": LionEventBase & {
		type: "lion.tasks.task.end";
		index: number;
		title: string;
		definition: string;
		status: DelegationStatus;
		summary: string;
	};
	"lion.checklist.snapshot": LionEventBase & {
		type: "lion.checklist.snapshot";
		kind: LionChecklistKind;
		slug: string;
		rootPath: string;
		checklist: LionChecklistSnapshot;
	};
	"lion.checklist.task_started": LionEventBase & {
		type: "lion.checklist.task_started";
		kind: LionChecklistKind;
		slug: string;
		rootPath: string;
		checklist: LionChecklistSnapshot;
		taskId: string;
	};
	"lion.checklist.task_recorded": LionEventBase & {
		type: "lion.checklist.task_recorded";
		kind: LionChecklistKind;
		slug: string;
		rootPath: string;
		checklist: LionChecklistSnapshot;
		taskId: string;
		status: LionTaskStatus;
		summary?: string;
	};
	"lion.checklist.updated": LionEventBase & {
		type: "lion.checklist.updated";
		kind: LionChecklistKind;
		slug: string;
		rootPath: string;
		checklist: LionChecklistSnapshot;
	};
}
