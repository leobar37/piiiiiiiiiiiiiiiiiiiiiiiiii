import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type LionRuntime, registerLionCommands } from "./commands.js";
import { restoreLionState } from "./persistence.js";
import { buildPlanningSystemPrompt } from "./prompts/index.js";
import { createInitialLionState } from "./state.js";
import { updateLionStatus } from "./ui.js";

export default function lionExtension(pi: ExtensionAPI): void {
	const runtime: LionRuntime = { state: createInitialLionState() };

	function restore(ctx: ExtensionContext): void {
		runtime.state = restoreLionState(ctx);
		updateLionStatus(ctx, runtime.state);
	}

	pi.on("session_start", async (_event, ctx) => restore(ctx));
	pi.on("session_tree", async (_event, ctx) => restore(ctx));

	pi.on("before_agent_start", async (event) => {
		if (!runtime.state.active) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${buildPlanningSystemPrompt(runtime.state)}` };
	});

	registerLionCommands(pi, runtime);
}
