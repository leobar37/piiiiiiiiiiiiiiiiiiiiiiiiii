import type { LionDashboardState } from "../types.ts";

export type LionStrategyName = LionDashboardState["strategy"];

/**
 * State-machine guard: determines whether the user/dashboard is allowed to
 * switch from the current Lion strategy to another one.
 *
 * Rules mirror the backend implementation in lion/strategy-match.ts:
 * - Staying in the same strategy is always allowed.
 * - Leaving "none" is always allowed.
 * - Entering "none" is only allowed while still in the "planning" phase
 *   (i.e. no work has been executed yet).
 * - Switching between "simple" and a plan-backed strategy ("plan" / "review")
 *   is allowed only while still in the "planning" phase.
 */
export function canChangeLionStrategy(
	state: Pick<LionDashboardState, "strategy" | "phase"> | undefined,
	next: LionStrategyName,
): boolean {
	if (!state) return next === "none" || true;
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
