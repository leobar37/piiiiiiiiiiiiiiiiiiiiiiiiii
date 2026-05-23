import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerLionCommands } from "./commands.js";
import { buildPlanningSystemPrompt } from "./prompts/index.js";
import { LionRuntime } from "./runtime.js";
import { registerLionTools } from "./tools.js";
import { stopLionSubagentWidget } from "./ui/subagents-widget.js";

export default function lionExtension(pi: ExtensionAPI): void {
	const runtime = new LionRuntime(pi);

	function restore(ctx: ExtensionContext): void {
		runtime.restore(ctx);
	}

	pi.on("session_start", async (_event, ctx) => {
		restore(ctx);
	});
	pi.on("session_tree", async (_event, ctx) => restore(ctx));
	pi.on("session_shutdown", async () => {
		stopLionSubagentWidget(runtime);
	});

	pi.on("before_agent_start", async (event) => {
		if (!runtime.state.active) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${buildPlanningSystemPrompt(runtime.state)}` };
	});

	registerLionTools(runtime);
	registerLionCommands(pi, runtime);
}
