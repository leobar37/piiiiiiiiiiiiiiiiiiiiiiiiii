import {
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { DEFAULT_BUILDER } from "./instructions/defaults.js";
import type {
	CreateSubAgentSessionOptions,
	CreateSubAgentSessionResult,
	EffectiveSubAgentConfig,
	InstructionBuilder,
	InstructionContext,
} from "./types.js";

function resolveBuilder(config: EffectiveSubAgentConfig): InstructionBuilder {
	return config.instructionBuilder ?? DEFAULT_BUILDER;
}

export async function createSubAgentSession(
	options: CreateSubAgentSessionOptions,
): Promise<CreateSubAgentSessionResult> {
	const cwd = options.cwd;
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

	// Build delegation instructions using the resolved builder
	const builder = resolveBuilder(options.config);
	const ctx: InstructionContext = { task: options.task, config: options.config };
	const instructions = builder(ctx);
	await session.sendUserMessage(instructions);

	return { session };
}
