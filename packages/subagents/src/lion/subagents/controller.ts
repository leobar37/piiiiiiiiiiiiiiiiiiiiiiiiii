import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SessionLogger } from "@local/pi-logger";
import { SubAgentController } from "../../controller.js";
import { BUILTIN_DEFINITIONS } from "../../definitions/index.js";
import type { SubAgentRuntimeConfigManager } from "../../types.js";

export function createLionSubAgentController(options: {
	ctx: ExtensionCommandContext;
	logger?: SessionLogger;
	configManager?: SubAgentRuntimeConfigManager;
}): SubAgentController {
	const cwd = options.ctx.cwd ?? options.ctx.sessionManager.getCwd();
	return new SubAgentController({
		definitions: BUILTIN_DEFINITIONS,
		cwd,
		modelRegistry: options.ctx.modelRegistry,
		logger: options.logger,
		configManager: options.configManager,
	});
}
