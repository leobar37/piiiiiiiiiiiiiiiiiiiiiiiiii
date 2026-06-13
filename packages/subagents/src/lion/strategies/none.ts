import type { LionState } from "../types.js";
import type { LionCompactionContext, LionStrategy, LionTaskConfigInput, LionTaskPromptContext } from "./types.js";

export class NoneLionStrategy implements LionStrategy {
	readonly name = "none" as const;

	buildMainPrompt(_state: LionState): string {
		return "";
	}

	decorateTaskPrompt(taskConfig: LionTaskConfigInput, _context: LionTaskPromptContext): LionTaskConfigInput {
		return taskConfig;
	}

	async buildCompactionInstructions(_state: LionState, _context: LionCompactionContext): Promise<string | null> {
		return null;
	}
}
