import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getSubagentController } from "./controller.js";
import { definitionSummary, runtimeStatus } from "./format.js";
import type { SubagentsRuntime } from "./types.js";

export function registerSubagentsCommands(pi: ExtensionAPI, runtime: SubagentsRuntime): void {
	pi.registerCommand("subagents", {
		description: "Inspect local sub-agent definitions and running tasks",
		handler: async (args, ctx) => {
			const controller = await getSubagentController(runtime, ctx);
			const command = args.trim() || "status";
			const details =
				command === "list"
					? { definitions: controller.getDefinitions().map(definitionSummary) }
					: runtimeStatus(runtime);
			ctx.ui.notify(JSON.stringify(details, null, 2), "info");
		},
	});
}
