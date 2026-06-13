import { NoneLionStrategy } from "./none.js";
import { PlanLionStrategy } from "./plan.js";
import { ReviewLionStrategy } from "./review.js";
import { SimpleLionStrategy } from "./simple.js";
import type { LionStrategy } from "./types.js";

const NONE_STRATEGY = new NoneLionStrategy();
const PLAN_STRATEGY = new PlanLionStrategy();
const SIMPLE_STRATEGY = new SimpleLionStrategy();
const REVIEW_STRATEGY = new ReviewLionStrategy();

export function getLionStrategy(name: LionStrategy["name"]): LionStrategy {
	if (name === "none") return NONE_STRATEGY;
	if (name === "simple") return SIMPLE_STRATEGY;
	if (name === "review") return REVIEW_STRATEGY;
	return PLAN_STRATEGY;
}

export type { LionStrategy } from "./types.js";
