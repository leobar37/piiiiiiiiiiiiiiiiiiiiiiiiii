import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { CreateSubAgentSessionOptions, CreateSubAgentSessionResult } from "./types.js";

const execFileAsync = promisify(execFile);

function buildDelegationInstructions(
	task: import("./types.js").DelegationTask,
	config: import("./types.js").EffectiveSubAgentConfig,
): string {
	const tools = config.tools?.join(", ") ?? "all (unrestricted)";
	const model = config.model ?? "inherited";
	const maxTurns = config.maxTurns ?? "unlimited";
	const timeout = config.timeout ?? "none";

	return `You are sub-agent "${config.name}" (${config.description}).

Your task ID: ${task.id}

${task.prompt}

Write your final result to: ${task.outputArtifact}
Signal completion by writing a summary to the result artifact.
Available tools: ${tools}
Model: ${model}
Max turns: ${maxTurns}
Timeout: ${timeout}`;
}

export async function createSubAgentSession(
	options: CreateSubAgentSessionOptions,
): Promise<CreateSubAgentSessionResult> {
	let cwd = options.cwd;
	let cleanup: (() => Promise<void>) | undefined;

	if (options.config.cwd) {
		cwd = resolve(options.cwd, options.config.cwd);
	}

	if (options.config.isolated) {
		const worktreePath = mkdtempSync(join(tmpdir(), `pi-subagent-${options.task.id}-`));
		await execFileAsync("git", ["worktree", "add", "--detach", worktreePath], {
			cwd: options.cwd,
		});
		cwd = worktreePath;
		cleanup = async () => {
			await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], {
				cwd: options.cwd,
			});
		};
	}

	try {
		const agentDir = getAgentDir();

		const loader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager: options.settingsManager,
			extensionFactories: [
				(pi) => {
					// Tool restrictions
					pi.on("session_start", async () => {
						if (options.config.tools?.length) {
							pi.setActiveTools(options.config.tools);
						} else if (options.config.disabledTools?.length) {
							const all = pi.getAllTools().map((t) => t.name);
							pi.setActiveTools(all.filter((t) => !options.config.disabledTools!.includes(t)));
						}
					});

					// System prompt injection
					pi.on("before_agent_start", async (event) => {
						return {
							systemPrompt: `${event.systemPrompt}\n\n${options.config.systemPrompt}`,
						};
					});

					// Register custom extension factory from definition
					if (options.config.extensionFactory) {
						options.config.extensionFactory(pi);
					}
				},
			],
		});

		await loader.reload();

		const { session } = await createAgentSession({
			resourceLoader: loader,
			cwd,
			model: undefined, // TODO: resolve model from config.model string
			thinkingLevel: options.config.thinkingLevel,
			settingsManager: options.settingsManager,
			sessionManager: SessionManager.create(cwd),
			authStorage: options.authStorage,
			modelRegistry: options.modelRegistry,
		});

		// Inject delegation instructions as first message
		const instructions = buildDelegationInstructions(options.task, options.config);
		await session.sendUserMessage(instructions);

		return {
			session,
			cleanup: cleanup ?? (async () => {}),
		};
	} catch (err) {
		if (cleanup) {
			try {
				await cleanup();
			} catch {
				/* best effort */
			}
		}
		throw err;
	}
}
