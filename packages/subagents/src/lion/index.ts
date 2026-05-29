import { compact, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SessionLogger } from "@local/pi-logger";
import { resolveConfiguredModel, SubAgentConfigManager } from "../config-manager.js";
import { registerLionCommands } from "./commands.js";
import { buildPlanningSystemPrompt } from "./prompts/index.js";
import { LionRuntime } from "./runtime.js";
import { registerLionTools } from "./tools.js";
import { stopLionSubagentWidget } from "./ui/subagents-widget.js";

export function lionExtension(pi: ExtensionAPI): void {
	const runtime = new LionRuntime(pi);

	function restore(ctx: ExtensionContext): void {
		runtime.restore(ctx);
	}

	async function ensureDashboard(): Promise<void> {
		try {
			const url = await runtime.startDashboard();
			console.log(`[lion] dashboard at ${url.href}`);
		} catch (err) {
			console.error("[lion] dashboard start failed:", err);
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		if (!runtime.logger) {
			runtime.logger = new SessionLogger({
				cwd: ctx.sessionManager.getCwd(),
				sessionId: ctx.sessionManager.getSessionId(),
			});
		}
		restore(ctx);
		if (runtime.state.active) {
			await ensureDashboard();
		}
	});
	pi.on("session_tree", async (_event, ctx) => {
		restore(ctx);
		if (runtime.state.active) {
			await ensureDashboard();
		}
	});
	pi.on("agent_start", async (event, ctx) => runtime.recordMainSessionEvent(event, ctx));
	pi.on("agent_end", async (event, ctx) => runtime.recordMainSessionEvent(event, ctx));
	pi.on("turn_start", async (event, ctx) => runtime.recordMainSessionEvent(event, ctx));
	pi.on("turn_end", async (event, ctx) => {
		runtime.recordMainSessionEvent(event, ctx);
	});
	pi.on("message_start", async (event, ctx) => runtime.recordMainSessionEvent(event, ctx));
	pi.on("message_update", async (event, ctx) => runtime.recordMainSessionEvent(event, ctx));
	pi.on("message_end", async (event, ctx) => runtime.recordMainSessionEvent(event, ctx));
	pi.on("tool_execution_start", async (event, ctx) => runtime.recordMainSessionEvent(event, ctx));
	pi.on("tool_execution_end", async (event, ctx) => runtime.recordMainSessionEvent(event, ctx));
	pi.on("tool_call", async (event) => {
		if (!runtime.state.active) return undefined;
		return runtime.delegationGuard.handleToolCall(event);
	});
	pi.on("session_shutdown", async () => {
		stopLionSubagentWidget(runtime);
		await runtime.stopDashboard();
	});

	// Start dashboard when Lion activates via events from the bus
	runtime.events.on("lion.activate.complete", () => {
		ensureDashboard().catch((err) => console.error("[lion] dashboard ensure failed:", err));
	});

	pi.on("before_agent_start", async (event) => {
		if (!runtime.state.active) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${buildPlanningSystemPrompt(runtime.state)}` };
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const instructions = await runtime.buildCompactionInstructions(ctx);
		if (!instructions || !ctx.model) return;

		const cwd = ctx.cwd ?? ctx.sessionManager.getCwd();
		const configManager = SubAgentConfigManager.load(cwd);
		const compactionConfig = configManager.getCompactionConfig();
		const modelResolution = resolveConfiguredModel(compactionConfig?.model, undefined, ctx.modelRegistry);
		const model = modelResolution.model ?? ctx.model;
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) return;

		const compaction = await compact(
			event.preparation,
			model,
			auth.apiKey ?? "",
			auth.headers,
			[event.customInstructions, instructions].filter(Boolean).join("\n\n"),
			event.signal,
		);
		return { compaction };
	});

	registerLionTools(runtime);
	registerLionCommands(pi, runtime);
}

export default lionExtension;
