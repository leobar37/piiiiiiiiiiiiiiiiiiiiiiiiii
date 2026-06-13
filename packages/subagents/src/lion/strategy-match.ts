import type { LionPhase, LionState, LionStrategyName } from "./types.js";

/**
 * Match helper for Lion strategy + phase combinations.
 * Centralizes strategy/phase branching to eliminate scattered if-chains.
 */
export function matchStrategy<T>(
	state: Pick<LionState, "strategy" | "phase">,
	patterns: {
		plan?: (phase: LionPhase) => T;
		simple?: (phase: LionPhase) => T;
		review?: (phase: LionPhase) => T;
		none?: (phase: LionPhase) => T;
		_default?: (strategy: LionStrategyName, phase: LionPhase) => T;
	},
): T {
	const { strategy, phase } = state;
	const handler = patterns[strategy];
	if (handler) return handler(phase);
	if (patterns._default) return patterns._default(strategy, phase);
	throw new Error(`Unhandled Lion strategy: ${strategy}`);
}

/**
 * Match helper for strategy only (ignores phase).
 */
export function matchStrategyOnly<T>(
	strategy: LionStrategyName,
	patterns: {
		plan?: () => T;
		simple?: () => T;
		review?: () => T;
		none?: () => T;
		_default?: () => T;
	},
): T {
	const handler = patterns[strategy];
	if (handler) return handler();
	if (patterns._default) return patterns._default();
	throw new Error(`Unhandled Lion strategy: ${strategy}`);
}

/**
 * Match helper for phase only.
 */
export function matchPhase<T>(
	phase: LionPhase,
	patterns: {
		planning: () => T;
		building: () => T;
	},
): T {
	return phase === "planning" ? patterns.planning() : patterns.building();
}

/**
 * Type guard: true for strategies that do not use durable plans.
 */
export function isNoPlanStrategy(strategy: LionStrategyName): boolean {
	return strategy === "simple" || strategy === "none";
}

/**
 * Type guard: true when the state has an active durable plan or review.
 */
export function hasActivePlan(state: LionState): boolean {
	return state.strategy === "plan" || state.strategy === "review";
}

/**
 * State-machine guard: determines whether the user/dashboard is allowed to
 * switch from the current Lion strategy to another one.
 *
 * Rules:
 * - Staying in the same strategy is always allowed.
 * - Leaving "none" is always allowed.
 * - Entering "none" is only allowed while still in the "planning" phase
 *   (i.e. no work has been executed yet).
 * - Switching between "simple" and a plan-backed strategy ("plan" / "review")
 *   is allowed only while still in the "planning" phase.
 */
export function canChangeLionStrategy(state: Pick<LionState, "strategy" | "phase">, next: LionStrategyName): boolean {
	const { strategy, phase } = state;
	if (strategy === next) return true;
	if (strategy === "none") return true;
	if (strategy === "simple") return true;
	if (next === "none" || next === "simple") return phase === "planning";
	if (strategy === "plan" || strategy === "review") {
		return phase === "planning" && (next === "plan" || next === "review");
	}
	return false;
}
