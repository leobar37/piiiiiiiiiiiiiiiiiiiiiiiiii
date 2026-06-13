/**
 * Web mode: Headless operation with web dashboard.
 *
 * Starts the agent session without TUI, allowing interaction
 * exclusively through the Lion web dashboard.
 */

import type { ImageContent } from "@earendil-works/pi-ai";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.js";
import { killTrackedDetachedChildren } from "../../utils/shell.js";

export interface WebModeOptions {
	initialMessage?: string;
	initialImages?: ImageContent[];
	initialMessages?: string[];
}

/**
 * Run in web mode.
 * Keeps the session alive without TUI, relying on the Lion dashboard
 * for all interaction.
 */
export async function runWebMode(runtimeHost: AgentSessionRuntime, options: WebModeOptions = {}): Promise<void> {
	let session = runtimeHost.session;
	let disposed = false;
	const signalCleanupHandlers: Array<() => void> = [];

	const disposeRuntime = async (): Promise<void> => {
		if (disposed) return;
		disposed = true;
		await runtimeHost.dispose();
	};

	const registerSignalHandlers = (): void => {
		const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
		if (process.platform !== "win32") {
			signals.push("SIGHUP");
		}

		for (const signal of signals) {
			const handler = () => {
				killTrackedDetachedChildren();
				void disposeRuntime().finally(() => {
					process.exit(signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143);
				});
			};
			process.on(signal, handler);
			signalCleanupHandlers.push(() => process.off(signal, handler));
		}
	};

	const rebindSession = async (): Promise<void> => {
		session = runtimeHost.session;
		await session.bindExtensions({
			commandContextActions: {
				waitForIdle: () => session.agent.waitForIdle(),
				newSession: async (newSessionOptions) => runtimeHost.newSession(newSessionOptions),
				fork: async (entryId, forkOptions) => {
					const result = await runtimeHost.fork(entryId, forkOptions);
					return { cancelled: result.cancelled };
				},
				navigateTree: async (targetId, navigateOptions) => {
					const result = await session.navigateTree(targetId, {
						summarize: navigateOptions?.summarize,
						customInstructions: navigateOptions?.customInstructions,
						replaceInstructions: navigateOptions?.replaceInstructions,
						label: navigateOptions?.label,
					});
					return { cancelled: result.cancelled };
				},
				switchSession: async (sessionPath, switchOptions) => runtimeHost.switchSession(sessionPath, switchOptions),
				reload: async () => {
					await session.reload();
				},
			},
			shutdownHandler: () => {
				void disposeRuntime().finally(() => {
					process.exit(0);
				});
			},
			onError: (err) => {
				console.error(`Extension error (${err.extensionPath}): ${err.error}`);
			},
		});
	};

	registerSignalHandlers();
	runtimeHost.setRebindSession(async () => {
		await rebindSession();
	});

	await rebindSession();

	// Send initial message if provided
	if (options.initialMessage) {
		try {
			await session.prompt(options.initialMessage, {
				images: options.initialImages,
				source: "interactive",
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[web] Failed to send initial message:", message);
		}
	}

	for (const message of options.initialMessages ?? []) {
		try {
			await session.prompt(message, { source: "interactive" });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error("[web] Failed to send message:", message);
		}
	}

	console.log("[web] Session active. Waiting for dashboard interaction...");
	console.log("[web] Press Ctrl+C to stop");

	// Keep the process alive
	try {
		await new Promise<void>(() => {
			// Never resolves - process stays alive until SIGINT/SIGTERM
		});
	} finally {
		for (const cleanup of signalCleanupHandlers) {
			cleanup();
		}
	}
}
