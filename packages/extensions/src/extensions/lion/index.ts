import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DashboardDaemon } from "@local/pi-dashboard";
import { registerLionCommands } from "./commands.js";
import { LionDashboardBridge } from "./dashboard-bridge.js";
import { buildPlanningSystemPrompt } from "./prompts/index.js";
import { createLionRuntime } from "./runtime.js";
import { registerLionTools } from "./tools.js";
import { stopLionSubagentWidget } from "./ui/subagents-widget.js";
import { showLionMessage } from "./ui.js";

export default function lionExtension(pi: ExtensionAPI): void {
	const runtime = createLionRuntime(pi);
	const dashboard = new DashboardDaemon();
	const dashboardBridge = new LionDashboardBridge(runtime, dashboard);
	runtime.dashboard = dashboard;
	runtime.dashboardBridge = dashboardBridge;

	function restore(ctx: ExtensionContext): void {
		runtime.persistence.restore(runtime, ctx);
	}

	pi.on("session_start", async (_event, ctx) => {
		restore(ctx);
		dashboardBridge.start();
	});
	pi.on("session_tree", async (_event, ctx) => restore(ctx));
	pi.on("session_shutdown", async () => {
		stopLionSubagentWidget(runtime);
		dashboardBridge.stop();
		dashboard.stop();
	});

	pi.on("before_agent_start", async (event) => {
		if (!runtime.state.active) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${buildPlanningSystemPrompt(runtime.state)}` };
	});

	registerLionTools(runtime);
	registerLionCommands(pi, runtime);

	pi.registerCommand("dashboard", {
		description: "Start Pi dashboard web UI",
		handler: async (args, _ctx) => {
			if (dashboard.isRunning && args.trim() === "stop") {
				dashboard.stop();
				showLionMessage(pi, "Dashboard stopped.");
				return;
			}

			const port = parseInt(args.trim(), 10) || 9393;
			const url = await dashboard.start(port);
			showLionMessage(pi, `Dashboard running at ${url.href}`);
		},
	});
}
