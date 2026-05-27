import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { BUILTIN_DEFINITIONS, SubAgentController } from "@local/pi-subagents";

export function createLionSubAgentController(options: { ctx: ExtensionCommandContext }): SubAgentController {
	return new SubAgentController({
		definitions: BUILTIN_DEFINITIONS,
		cwd: options.ctx.cwd,
		modelRegistry: options.ctx.modelRegistry,
	});
}
