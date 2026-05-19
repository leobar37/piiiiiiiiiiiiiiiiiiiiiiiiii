import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { BUILTIN_DEFINITIONS, SubAgentController, type SubAgentEvent } from "@local/pi-subagents";
import type { LionEventSink, LionPlan, LionTask } from "../types.js";

export function createLionSubAgentController(options: {
	ctx: ExtensionCommandContext;
	runId: string;
	plan: LionPlan;
	task: LionTask;
	emit: LionEventSink;
}): SubAgentController {
	return new SubAgentController({
		definitions: BUILTIN_DEFINITIONS,
		cwd: options.ctx.cwd,
		modelRegistry: options.ctx.modelRegistry,
		onEvent: (subagentEvent: SubAgentEvent) => {
			options.emit({
				type: "lion.subagent.event",
				timestamp: Date.now(),
				runId: options.runId,
				planSlug: options.plan.slug,
				planPath: options.plan.rootPath,
				taskId: options.task.id,
				subagentEvent,
			});
		},
	});
}
