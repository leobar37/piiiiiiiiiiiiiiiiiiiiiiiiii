/**
 * Lifecycle policy validators for goal-v2.
 * Each validator returns a discriminated union; callers decide how to surface failures.
 */

import type { GoalCore } from "./core.js";

export interface PolicyOk {
	ok: true;
}

export interface PolicyError {
	ok: false;
	message: string;
}

export type PolicyResult = PolicyOk | PolicyError;

export function ok(): PolicyOk {
	return { ok: true };
}

export function err(message: string): PolicyError {
	return { ok: false, message };
}

export function canCreateDraft(core: GoalCore, objective: string): PolicyResult {
	const trimmed = objective.trim();
	if (!trimmed) {
		return err("objective must not be empty");
	}
	if (core.mode === "active" || core.goal) {
		return err("an active goal already exists; clear or complete it first");
	}
	if (core.mode === "auditing") {
		return err("a goal is being audited; wait for the audit to finish");
	}
	return ok();
}

export function canSetActiveGoal(core: GoalCore): PolicyResult {
	if (core.mode === "active" || core.goal) {
		return err("an active goal already exists; clear or complete it first");
	}
	if (core.mode === "auditing") {
		return err("a goal is being audited; wait for the audit to finish");
	}
	return ok();
}

export function canProposeDraft(core: GoalCore): PolicyResult {
	if (core.mode !== "drafting" || !core.draft) {
		return err("no draft is being prepared");
	}
	return ok();
}

export function canActivateDraft(core: GoalCore): PolicyResult {
	if (core.mode !== "drafting" || !core.draft) {
		return err("no draft is available to activate");
	}
	const objective = core.draft.clarifiedObjective?.trim() || core.draft.originalObjective.trim();
	if (!objective) {
		return err("draft objective is empty");
	}
	return ok();
}

export function canUpdateDraft(core: GoalCore): PolicyResult {
	if (core.mode !== "drafting" || !core.draft) {
		return err("no draft is being prepared");
	}
	return ok();
}

export function canMarkComplete(core: GoalCore): PolicyResult {
	if (!core.goal) {
		return err("no active goal to complete");
	}
	if (core.goal.status === "complete") {
		return err("goal is already complete");
	}
	if (core.mode === "auditing") {
		return err("a goal is already being audited");
	}
	return ok();
}

export function canMarkBlocked(core: GoalCore, blockerReason: string | undefined): PolicyResult {
	if (!core.goal) {
		return err("no active goal to block");
	}
	if (core.goal.status === "complete") {
		return err("cannot block a completed goal");
	}
	if (core.goal.status === "blocked") {
		return err("goal is already blocked");
	}
	if (!blockerReason?.trim()) {
		return err("blocker_reason is required when marking a goal blocked");
	}
	return ok();
}

export function canPause(core: GoalCore): PolicyResult {
	if (!core.goal) {
		return err("no goal to pause");
	}
	if (core.goal.status !== "active") {
		return err(`cannot pause goal with status "${core.goal.status}"`);
	}
	return ok();
}

export function canResume(core: GoalCore): PolicyResult {
	if (!core.goal) {
		return err("no goal to resume");
	}
	if (core.goal.status !== "paused" && core.goal.status !== "blocked") {
		return err(`cannot resume goal with status "${core.goal.status}"`);
	}
	return ok();
}

export function canAbort(core: GoalCore): PolicyResult {
	if (!core.goal && !core.draft) {
		return err("no goal or draft to abort");
	}
	if (core.mode === "auditing") {
		return err("a goal is being audited; wait for the audit to finish");
	}
	return ok();
}

export function canClear(core: GoalCore): PolicyResult {
	if (!core.goal && !core.draft) {
		return err("no goal or draft to clear");
	}
	if (core.mode === "auditing") {
		return err("a goal is being audited; wait for the audit to finish");
	}
	return ok();
}

export function canRecordProgress(core: GoalCore): PolicyResult {
	if (!core.goal) {
		return err("no goal exists");
	}
	if (core.goal.status !== "active") {
		return err(`cannot record progress for goal with status "${core.goal.status}"`);
	}
	return ok();
}
