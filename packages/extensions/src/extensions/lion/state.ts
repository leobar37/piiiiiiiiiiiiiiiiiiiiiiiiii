import type { LionState } from "./types.js";
import { LION_DEFAULT_MAX_ATTEMPTS } from "./types.js";

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
