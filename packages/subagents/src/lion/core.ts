import type { DelegationResult } from "../types.js";
import type { LionBuildResult, LionPlan, LionReviewVerdict, LionTask } from "./types.js";

export type LionRunStatus =
	| "idle"
	| "executing"
	| "awaiting_orchestrator"
	| "reviewing"
	| "correcting"
	| "approved"
	| "rejected"
	| "failed";

export type LionSubagentRole = "analyzer" | "planner" | "executor" | "reviewer" | "validator";

export interface LionRunSubagent {
	role: LionSubagentRole;
	taskId: string;
	instanceId: string;
	status: DelegationResult["status"];
	summary: string;
	updatedAt: number;
}

export interface LionRun {
	runId: string;
	planSlug: string;
	planPath: string;
	taskId: string;
	taskTitle: string;
	status: LionRunStatus;
	attempts: number;
	maxAttempts: number;
	executorTaskId: string | null;
	reviewerTaskId: string | null;
	executorSummary: string;
	reviewerSummary: string;
	verdict: LionReviewVerdict | null;
	error: string | null;
	subagents: LionRunSubagent[];
	createdAt: number;
	updatedAt: number;
}

export interface LionCore {
	activeRun: LionRun | null;
	runHistory: LionRun[];
}

export function createLionCore(): LionCore {
	return { activeRun: null, runHistory: [] };
}

export function startRun(
	core: LionCore,
	options: { runId: string; plan: LionPlan; task: LionTask; maxAttempts: number },
): LionRun {
	const now = Date.now();
	const run: LionRun = {
		runId: options.runId,
		planSlug: options.plan.slug,
		planPath: options.plan.rootPath,
		taskId: options.task.id,
		taskTitle: options.task.title,
		status: "executing",
		attempts: 0,
		maxAttempts: options.maxAttempts,
		executorTaskId: null,
		reviewerTaskId: null,
		executorSummary: "",
		reviewerSummary: "",
		verdict: null,
		error: null,
		subagents: [],
		createdAt: now,
		updatedAt: now,
	};
	core.activeRun = run;
	return run;
}

export function recordSubagentResult(core: LionCore, role: LionSubagentRole, result: DelegationResult): LionRun {
	const run = requireActiveRun(core);
	const now = Date.now();
	const record: LionRunSubagent = {
		role,
		taskId: result.taskId,
		instanceId: result.finalState.instanceId,
		status: result.status,
		summary: result.summary,
		updatedAt: now,
	};
	run.subagents = [...run.subagents.filter((subagent) => subagent.taskId !== result.taskId), record];
	run.updatedAt = now;

	if (role === "executor") {
		run.executorTaskId = result.taskId;
		run.executorSummary = result.summary;
		run.attempts += 1;
		run.status = result.status === "completed" ? "awaiting_orchestrator" : "failed";
	}

	if (role === "analyzer" || role === "planner") {
		run.status = result.status === "completed" ? "awaiting_orchestrator" : "failed";
	}

	if (role === "reviewer") {
		run.reviewerTaskId = result.taskId;
		run.reviewerSummary = result.summary;
		run.status = result.status === "completed" ? "awaiting_orchestrator" : "failed";
	}

	if (role === "validator") {
		run.status = result.status === "completed" ? "awaiting_orchestrator" : "failed";
	}

	if (result.status !== "completed") {
		run.error = `${role} delegation ended with status ${result.status}.`;
	}

	return run;
}

export function recordReviewVerdict(core: LionCore, verdict: LionReviewVerdict, reviewerSummary: string): LionRun {
	const run = requireActiveRun(core);
	run.verdict = verdict;
	run.reviewerSummary = reviewerSummary;
	run.status = verdict === "approved" ? "approved" : verdict === "rejected" ? "rejected" : "awaiting_orchestrator";
	run.updatedAt = Date.now();
	return run;
}

export function markAwaitingOrchestrator(core: LionCore): LionRun {
	const run = requireActiveRun(core);
	run.status = "awaiting_orchestrator";
	run.updatedAt = Date.now();
	return run;
}

export function setRunStatus(core: LionCore, status: LionRunStatus): LionRun {
	const run = requireActiveRun(core);
	run.status = status;
	run.updatedAt = Date.now();
	return run;
}

export function finishRun(
	core: LionCore,
	status: Extract<LionRunStatus, "approved" | "rejected" | "failed">,
): LionBuildResult {
	const run = requireActiveRun(core);
	run.status = status;
	run.updatedAt = Date.now();
	const result: LionBuildResult = {
		taskId: run.taskId,
		attempts: run.attempts,
		status: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "failed",
		executorSummary: run.executorSummary || undefined,
		reviewerSummary: run.reviewerSummary || undefined,
		error: run.error ?? undefined,
	};
	core.runHistory = [...core.runHistory, run].slice(-20);
	core.activeRun = null;
	return result;
}

export function addSyntheticRun(core: LionCore, run: LionRun): void {
	core.runHistory = [...core.runHistory, run].slice(-20);
}

export function snapshot(core: LionCore): LionCore {
	return {
		activeRun: core.activeRun ? cloneRun(core.activeRun) : null,
		runHistory: core.runHistory.map(cloneRun),
	};
}

function requireActiveRun(core: LionCore): LionRun {
	if (!core.activeRun) throw new Error("Lion has no active run");
	return core.activeRun;
}

function cloneRun(run: LionRun): LionRun {
	return {
		...run,
		subagents: run.subagents.map((subagent) => ({ ...subagent })),
	};
}
