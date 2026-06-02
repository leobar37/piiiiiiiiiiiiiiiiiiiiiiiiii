import { randomUUID } from "node:crypto";
import type { DelegationStatus, SubAgentEvent } from "../../types.js";
import type {
	LionBuildResult,
	LionChecklistKind,
	LionChecklistSnapshot,
	LionDelegationAgent,
	LionEventMap,
	LionPhase,
	LionPlanKind,
	LionReviewVerdict,
	LionStrategyName,
	LionTaskStatus,
	LionTaskStrategy,
	LionTasksResult,
} from "../types.js";

// =============================================================================
// Lion Event Factory Functions
//
// Each factory returns a flat LionEvent object matching the corresponding
// LionEventMap entry. No wrapper payload object.
// =============================================================================

export const LionEvents = {
	activateStart(payload: { runId: string; input?: string }): LionEventMap["lion.activate.start"] {
		return { type: "lion.activate.start", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	activateComplete(payload: {
		runId: string;
		strategy: LionStrategyName;
		phase: LionPhase;
	}): LionEventMap["lion.activate.complete"] {
		return { type: "lion.activate.complete", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	planLoaded(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskCount: number;
		kind: LionPlanKind;
	}): LionEventMap["lion.plan.loaded"] {
		return { type: "lion.plan.loaded", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	modeChanged(payload: {
		runId: string;
		strategy: LionStrategyName;
		phase: LionPhase;
	}): LionEventMap["lion.mode.changed"] {
		return { type: "lion.mode.changed", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	buildStart(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId?: string;
	}): LionEventMap["lion.build.start"] {
		return { type: "lion.build.start", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	taskSelected(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		title: string;
	}): LionEventMap["lion.task.selected"] {
		return { type: "lion.task.selected", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	delegationPromptCreated(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		attempt: number;
		agent: LionDelegationAgent;
		promptLength: number;
	}): LionEventMap["lion.delegation.prompt.created"] {
		return { type: "lion.delegation.prompt.created", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	delegationStart(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		attempt: number;
		agent: LionDelegationAgent;
	}): LionEventMap["lion.delegation.start"] {
		return { type: "lion.delegation.start", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	delegationEnd(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		attempt: number;
		agent: LionDelegationAgent;
		status: string;
		summary: string;
	}): LionEventMap["lion.delegation.end"] {
		return { type: "lion.delegation.end", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	reviewVerdict(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		attempt: number;
		verdict: LionReviewVerdict;
		summary: string;
	}): LionEventMap["lion.review.verdict"] {
		return { type: "lion.review.verdict", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	correctionRequested(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		feedback: string;
	}): LionEventMap["lion.correction.requested"] {
		return { type: "lion.correction.requested", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	taskApproved(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
	}): LionEventMap["lion.task.approved"] {
		return { type: "lion.task.approved", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	taskRejected(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		reason: string;
	}): LionEventMap["lion.task.rejected"] {
		return { type: "lion.task.rejected", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	taskMarkedComplete(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
	}): LionEventMap["lion.task.marked_complete"] {
		return { type: "lion.task.marked_complete", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	buildComplete(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		attempt: number;
		result: LionBuildResult;
	}): LionEventMap["lion.build.complete"] {
		return { type: "lion.build.complete", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	buildFailed(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		attempt?: number;
		error: string;
	}): LionEventMap["lion.build.failed"] {
		return { type: "lion.build.failed", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	subagentEvent(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		taskId: string;
		subagentEvent: SubAgentEvent;
	}): LionEventMap["lion.subagent.event"] {
		return { type: "lion.subagent.event", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	tasksStart(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		strategy: LionTaskStrategy;
		taskCount: number;
		concurrency?: number;
	}): LionEventMap["lion.tasks.start"] {
		return { type: "lion.tasks.start", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	tasksComplete(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		result: LionTasksResult;
	}): LionEventMap["lion.tasks.complete"] {
		return { type: "lion.tasks.complete", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	tasksTaskStart(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		index: number;
		title: string;
		definition: string;
	}): LionEventMap["lion.tasks.task.start"] {
		return { type: "lion.tasks.task.start", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	tasksTaskEnd(payload: {
		runId: string;
		planSlug: string;
		planPath: string;
		index: number;
		title: string;
		definition: string;
		status: DelegationStatus;
		summary: string;
	}): LionEventMap["lion.tasks.task.end"] {
		return { type: "lion.tasks.task.end", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	checklistSnapshot(payload: {
		runId: string;
		kind: LionChecklistKind;
		slug: string;
		rootPath: string;
		checklist: LionChecklistSnapshot;
	}): LionEventMap["lion.checklist.snapshot"] {
		return { type: "lion.checklist.snapshot", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	checklistTaskStarted(payload: {
		runId: string;
		kind: LionChecklistKind;
		slug: string;
		rootPath: string;
		checklist: LionChecklistSnapshot;
		taskId: string;
	}): LionEventMap["lion.checklist.task_started"] {
		return { type: "lion.checklist.task_started", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	checklistTaskRecorded(payload: {
		runId: string;
		kind: LionChecklistKind;
		slug: string;
		rootPath: string;
		checklist: LionChecklistSnapshot;
		taskId: string;
		status: LionTaskStatus;
		summary?: string;
	}): LionEventMap["lion.checklist.task_recorded"] {
		return { type: "lion.checklist.task_recorded", timestamp: Date.now(), id: randomUUID(), ...payload };
	},

	checklistUpdated(payload: {
		runId: string;
		kind: LionChecklistKind;
		slug: string;
		rootPath: string;
		checklist: LionChecklistSnapshot;
	}): LionEventMap["lion.checklist.updated"] {
		return { type: "lion.checklist.updated", timestamp: Date.now(), id: randomUUID(), ...payload };
	},
} as const;
