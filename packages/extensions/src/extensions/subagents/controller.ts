import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { BUILTIN_DEFINITIONS, FsArtifactStore, SubAgentController } from "@local/pi-subagents";
import { recordSubagentEvent, resetSubagentsRuntime } from "./runtime.js";
import type { SubagentsRuntime } from "./types.js";

export async function getSubagentController(
	runtime: SubagentsRuntime,
	ctx: ExtensionContext,
): Promise<SubAgentController> {
	if (runtime.controller && runtime.cwd === ctx.cwd) {
		return runtime.controller;
	}
	await resetSubagentsRuntime(runtime);
	runtime.cwd = ctx.cwd;

	runtime.controller = new SubAgentController({
		definitions: BUILTIN_DEFINITIONS,
		cwd: ctx.cwd,
		artifactStore: new FsArtifactStore(join(ctx.cwd, ".pi", "subagents")),
		modelRegistry: ctx.modelRegistry,
		onEvent: (event) => recordSubagentEvent(runtime, event),
	});

	return runtime.controller;
}
