/**
 * Core algorithm for goal-v2 extension.
 * Pure state management — no prompts, no UI, no ExtensionAPI.
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalDraft, GoalMode, GoalStatus, LegacyPersistedGoalState, PersistedGoalState } from "./types.js";
import { cloneGoal, nowSeconds, validateObjective } from "./utils.js";

export interface GoalCore {
	goal: Goal | null;
	draft: GoalDraft | null;
	mode: GoalMode;
	activeSinceMs: number | null;
	continuationQueued: boolean;
}

export function createCore(): GoalCore {
	return {
		goal: null,
		draft: null,
		mode: "idle",
		activeSinceMs: null,
		continuationQueued: false,
	};
}

export function currentGoalSnapshot(core: GoalCore): Goal | null {
	if (!core.goal) return null;
	const snapshot = cloneGoal(core.goal);
	if (snapshot.status === "active" && core.activeSinceMs !== null) {
		snapshot.timeUsedSeconds += Math.max(0, Math.floor((Date.now() - core.activeSinceMs) / 1000));
	}
	return snapshot;
}

export function currentDraftSnapshot(core: GoalCore): GoalDraft | null {
	if (!core.draft) return null;
	return { ...core.draft };
}

export function accountElapsed(core: GoalCore): boolean {
	if (!core.goal || core.goal.status !== "active" || core.activeSinceMs === null) return false;
	const seconds = Math.max(0, Math.floor((Date.now() - core.activeSinceMs) / 1000));
	if (seconds <= 0) return false;
	core.goal.timeUsedSeconds += seconds;
	core.goal.updatedAt = nowSeconds();
	core.activeSinceMs += seconds * 1000;
	return true;
}

export function createDraft(core: GoalCore, objectiveInput: string): GoalDraft {
	const originalObjective = validateObjective(objectiveInput);
	const ts = nowSeconds();
	const draft: GoalDraft = {
		id: randomUUID(),
		originalObjective,
		successCriteria: [],
		relevantFiles: [],
		constraints: [],
		notes: [],
		createdAt: ts,
	};
	core.draft = draft;
	core.mode = "drafting";
	core.continuationQueued = false;
	return draft;
}

export function updateDraft(
	core: GoalCore,
	updates: {
		clarifiedObjective?: string;
		successCriteria?: string[];
		relevantFiles?: string[];
		constraints?: string[];
		notes?: string[];
	},
): GoalDraft {
	if (!core.draft) {
		throw new Error("cannot update draft because no draft exists");
	}
	if (updates.clarifiedObjective !== undefined) {
		core.draft.clarifiedObjective = updates.clarifiedObjective.trim() || undefined;
	}
	if (updates.successCriteria !== undefined) {
		core.draft.successCriteria = updates.successCriteria;
	}
	if (updates.relevantFiles !== undefined) {
		core.draft.relevantFiles = updates.relevantFiles;
	}
	if (updates.constraints !== undefined) {
		core.draft.constraints = updates.constraints;
	}
	if (updates.notes !== undefined) {
		core.draft.notes = updates.notes;
	}
	return { ...core.draft };
}

export function activateDraft(core: GoalCore): Goal {
	if (!core.draft) {
		throw new Error("cannot activate goal because no draft exists");
	}
	const draft = core.draft;
	const ts = nowSeconds();
	const goal: Goal = {
		id: draft.id,
		objective: draft.clarifiedObjective?.trim() || draft.originalObjective,
		status: "active",
		phase: "context_gathering",
		timeUsedSeconds: 0,
		createdAt: ts,
		updatedAt: ts,
	};
	core.goal = goal;
	core.draft = null;
	core.mode = "active";
	core.activeSinceMs = Date.now();
	core.continuationQueued = false;
	return goal;
}

export function setGoal(core: GoalCore, objectiveInput: string): Goal {
	createDraft(core, objectiveInput);
	return activateDraft(core);
}

export function setGoalStatus(core: GoalCore, status: GoalStatus): Goal {
	if (!core.goal) {
		throw new Error("cannot update goal because no goal exists");
	}
	if (core.goal.status === "active" && status !== "active") {
		accountElapsed(core);
		core.activeSinceMs = null;
	}
	if (status === "active" && core.goal.status !== "active") {
		core.activeSinceMs = Date.now();
		core.continuationQueued = false;
	}
	core.goal.status = status;
	if (status === "active" && core.goal.phase === "blocked") {
		core.goal.phase = "executing";
		core.goal.blockerReason = undefined;
	}
	if (status === "blocked") {
		core.goal.phase = "blocked";
	}
	if (status === "complete") {
		core.goal.phase = "complete";
	}
	core.goal.updatedAt = nowSeconds();
	core.mode = status === "complete" ? "idle" : "active";
	return core.goal;
}

export function reactivateGoal(core: GoalCore): Goal {
	if (!core.goal) {
		throw new Error("cannot reactivate goal because no goal exists");
	}
	core.goal.status = "active";
	core.goal.phase = "executing";
	core.goal.blockerReason = undefined;
	core.activeSinceMs = Date.now();
	core.continuationQueued = false;
	core.goal.updatedAt = nowSeconds();
	core.mode = "active";
	return core.goal;
}

export function setGoalContextPath(core: GoalCore, path: string): void {
	if (!core.goal) {
		throw new Error("cannot set context path because no goal exists");
	}
	core.goal.contextPath = path;
}

export function setGoalPhase(core: GoalCore, phase: Goal["phase"], blockerReason?: string): Goal {
	if (!core.goal) {
		throw new Error("cannot update goal phase because no goal exists");
	}
	if (phase === "blocked") {
		setGoalStatus(core, "blocked");
		core.goal.blockerReason = blockerReason?.trim() || undefined;
	} else {
		core.goal.phase = phase;
		if (core.goal.status === "blocked") {
			core.goal.status = "active";
			core.activeSinceMs = Date.now();
			core.continuationQueued = false;
		}
		core.goal.blockerReason = undefined;
		core.goal.updatedAt = nowSeconds();
	}
	core.mode = "active";
	return core.goal;
}

export function setGoalMode(core: GoalCore, mode: GoalMode): void {
	core.mode = mode;
}

export function clearGoal(core: GoalCore): boolean {
	if (!core.goal && !core.draft) return false;
	if (core.goal?.status === "active") accountElapsed(core);
	core.goal = null;
	core.draft = null;
	core.mode = "idle";
	core.activeSinceMs = null;
	core.continuationQueued = false;
	return true;
}

export function buildPersistedState(core: GoalCore, action: PersistedGoalState["action"]): PersistedGoalState {
	return {
		version: 3,
		action,
		goal: core.goal ? cloneGoal(core.goal) : null,
		draft: core.draft ? { ...core.draft } : null,
		mode: core.mode,
	};
}

function migrateV2State(state: LegacyPersistedGoalState): PersistedGoalState {
	const goal = state.goal;
	const mode: GoalMode = goal
		? goal.status === "complete"
			? "idle"
			: goal.status === "active"
				? "active"
				: "active"
		: "idle";
	return {
		version: 3,
		action: state.action,
		goal,
		draft: null,
		mode,
	};
}

export function restoreFromState(
	core: GoalCore,
	state: PersistedGoalState | LegacyPersistedGoalState | undefined,
): void {
	const migrated = state?.version === 2 ? migrateV2State(state) : state;
	core.goal = migrated?.goal ? cloneGoal(migrated.goal) : null;
	core.draft = migrated?.draft ? { ...migrated.draft } : null;
	core.mode = migrated?.mode ?? (core.goal ? "active" : "idle");
	core.activeSinceMs = core.goal?.status === "active" ? Date.now() : null;
	core.continuationQueued = false;
}
