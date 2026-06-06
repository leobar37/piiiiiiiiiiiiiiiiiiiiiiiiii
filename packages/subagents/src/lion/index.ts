import { compact, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { SessionLogger } from "@local/pi-logger";
import { loadConfigManager } from "../config-loader.js";
import { resolveConfiguredModel } from "../config-manager.js";
import { registerLionCommands } from "./commands.js";
import { LionRuntime } from "./runtime.js";
import { getLionStrategy } from "./strategies/index.js";
import { registerLionTools } from "./tools.js";
import { stopLionSubagentWidget } from "./ui/subagents-widget.js";
import { createRunId } from "./utils.js";

export function lionExtension(pi: ExtensionAPI): void {
	const runtime = new LionRuntime(pi, process.cwd());

	function restore(ctx: ExtensionContext): void {
		const cwd = ctx.sessionManager.getCwd();
		if (runtime.cwd !== cwd) {
			// Re-initialize runtime with correct cwd for state persistence
			(runtime as unknown as { cwd: string }).cwd = cwd;
		}
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
		const cwd = ctx.sessionManager.getCwd();
		const sessionId = ctx.sessionManager.getSessionId();
		if (!runtime.logger) {
			runtime.logger = new SessionLogger({
				cwd,
				sessionId,
			});
		}
		// Initialize structured run logger for this session
		if (!runtime.runLogger) {
			const runLogger = runtime.initRunLogger(cwd, createRunId());
			runLogger.startRun({
				planSlug: runtime.state.activePlanSlug,
				planPath: runtime.state.activePlanPath,
			});
		}
		// Load project config from config.pi.ts if available
		if (!runtime.configManager) {
			try {
				const configManager = await loadConfigManager(cwd);
				runtime.configManager = configManager;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				runtime.logError("config-load", err);
				console.error(`[lion] failed to load config.pi.ts: ${message}`);
			}
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
	pi.on("tool_result", async (event) => {
		if (!runtime.state.active) return undefined;
		runtime.delegationGuard.handleToolResult(event);
		return undefined;
	});
	pi.on("session_shutdown", async () => {
		// Mark run as interrupted only if it hasn't already completed
		const runLogger = runtime.runLogger;
		if (runLogger && !runLogger.closed) {
			runtime.interruptRun(undefined, "session_shutdown");
		}
		stopLionSubagentWidget(runtime);
		await runtime.stopDashboard();
	});

	// Start dashboard when Lion activates via events from the bus
	runtime.events.on("lion.activate.complete", () => {
		ensureDashboard().catch((err) => console.error("[lion] dashboard ensure failed:", err));
	});

	pi.on("before_agent_start", async (event) => {
		if (!runtime.state.active) return;
		const strategy = getLionStrategy(runtime.state.strategy);
		return { systemPrompt: `${event.systemPrompt}\n\n${strategy.buildMainPrompt(runtime.state)}` };
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const instructions = await runtime.buildCompactionInstructions(ctx);
		if (!instructions || !ctx.model) return;

		const configManager = runtime.configManager;
		if (!configManager) return;

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
