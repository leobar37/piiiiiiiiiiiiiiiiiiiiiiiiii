import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { BUILTIN_DEFINITIONS, SubAgentController } from "@local/pi-subagents";
import type { LionPlan, LionTask } from "../types.js";

export function createLionSubAgentController(options: {
	ctx: ExtensionCommandContext;
	runId: string;
	plan: LionPlan;
	task: LionTask;
}): SubAgentController {
	return new SubAgentController({
		definitions: BUILTIN_DEFINITIONS,
		cwd: options.ctx.cwd,
		modelRegistry: options.ctx.modelRegistry,
	});
}
