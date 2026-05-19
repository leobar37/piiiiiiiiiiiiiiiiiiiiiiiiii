import {
	LION_DEFAULT_MAX_ATTEMPTS,
	type LionBuildResult,
	type LionMode,
	type LionPlan,
	type LionState,
} from "./types.js";

export function createInitialLionState(): LionState {
	return {
		version: 1,
		active: false,
		mode: "planning",
		activePlanPath: null,
		activePlanSlug: null,
		planKind: null,
		activeTaskId: null,
		maxAttempts: LION_DEFAULT_MAX_ATTEMPTS,
		lastRunId: null,
	};
}

export function activatePlanning(state: LionState): LionState {
	return { ...state, active: true, mode: "planning" };
}

export function activatePlan(state: LionState, plan: LionPlan): LionState {
	return {
		...state,
		active: true,
		mode: "planning",
		activePlanPath: plan.rootPath,
		activePlanSlug: plan.slug,
		planKind: plan.kind,
		activeTaskId: null,
	};
}

export function setMode(state: LionState, mode: LionMode): LionState {
	return { ...state, active: true, mode };
}

export function setActiveTask(state: LionState, taskId: string | null): LionState {
	return { ...state, activeTaskId: taskId };
}

export function setLastRun(state: LionState, runId: string): LionState {
	return { ...state, lastRunId: runId };
}

export function applyBuildResult(state: LionState, result: LionBuildResult): LionState {
	return { ...state, mode: "planning", activeTaskId: null, lastBuild: result };
}
