import {
	compact,
	createAgentSession,
	DefaultResourceLoader,
	getAgentDir,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveConfiguredModel, SubAgentConfigManager } from "./config-manager.js";
import { DEFAULT_BUILDER } from "./instructions/defaults.js";
import { applyInternalSkillPrecedence, getInternalSkillPaths } from "./internal-skills.js";
import type {
	CreateSubAgentSessionOptions,
	CreateSubAgentSessionResult,
	EffectiveSubAgentConfig,
	InstructionBuilder,
	InstructionContext,
} from "./types.js";

const INTERNAL_SUBAGENT_TOOLS = ["subagent_record_context", "subagent_read_context", "subagent_record_result"];
const DISALLOWED_SUBAGENT_TOOLS = [
	"lion_tasks",
	"lion_checklist_read",
	"lion_checklist_start_next",
	"lion_checklist_record",
];

function resolveBuilder(config: EffectiveSubAgentConfig): InstructionBuilder {
	return config.instructionBuilder ?? DEFAULT_BUILDER;
}

export function buildSubAgentInstructions(options: {
	config: EffectiveSubAgentConfig;
	task: CreateSubAgentSessionOptions["task"];
}): string {
	const builder = resolveBuilder(options.config);
	const ctx: InstructionContext = {
		task: options.task,
		config: options.config,
		orchestration: options.task.orchestration,
	};
	return builder(ctx);
}

export function preserveInternalSubagentTools(requestedTools: string[], availableTools: string[]): string[] {
	const available = new Set(availableTools);
	const internal = INTERNAL_SUBAGENT_TOOLS.filter((tool) => available.has(tool));
	return filterDisallowedSubagentTools(Array.from(new Set([...requestedTools, ...internal])));
}

export function filterDisallowedSubagentTools(tools: string[]): string[] {
	const disallowed = new Set(DISALLOWED_SUBAGENT_TOOLS);
	return tools.filter((tool) => !disallowed.has(tool));
}

export async function createSubAgentSession(
	options: CreateSubAgentSessionOptions,
): Promise<CreateSubAgentSessionResult> {
	const cwd = options.cwd;
	const resourceCwd = options.resourceCwd;
	const agentDir = getAgentDir();
	const configManager = options.configManager ?? SubAgentConfigManager.defaultsOnly();
	const contextStore = options.contextStore;
	const modelResolution = resolveConfiguredModel(
		options.config.model,
		options.config.fallbackModels,
		options.modelRegistry,
	);
	const internalSkillPaths = getInternalSkillPaths();

	const loader = new DefaultResourceLoader({
		cwd: resourceCwd,
		agentDir,
		settingsManager: options.settingsManager,
		additionalSkillPaths: [...internalSkillPaths, ...(options.config.skillPaths ?? [])],
		skillsOverride: (base) =>
			applyInternalSkillPrecedence({
				base,
				cwd: resourceCwd,
				agentDir,
				skillPaths: internalSkillPaths,
			}),
		extensionFactories: [
			(pi) => {
				// Tool restrictions
				pi.on("session_start", async () => {
					if (options.config.tools?.length) {
						pi.setActiveTools(
							preserveInternalSubagentTools(
								options.config.tools,
								pi.getAllTools().map((t) => t.name),
							),
						);
					} else if (options.config.disabledTools?.length) {
						const all = pi.getAllTools().map((t) => t.name);
						pi.setActiveTools(
							filterDisallowedSubagentTools(all.filter((t) => !options.config.disabledTools!.includes(t))),
						);
					}
				});

				// System prompt injection
				pi.on("before_agent_start", async (event, ctx) => {
					const contextSummary = contextStore
						? await contextStore.formatForPrompt(ctx.sessionManager.getSessionId(), options.task.id)
						: undefined;
					const modelWarnings =
						modelResolution.warnings.length > 0
							? `\n\nSubagent model warnings:\n${modelResolution.warnings.map((warning) => `- ${warning}`).join("\n")}`
							: "";
					const durableContext = contextSummary
						? `\n\nDurable subagent context:\n${contextSummary}\n\nUse subagent_record_context when you learn durable context, decisions, blockers, files, or verification evidence.`
						: "";
					return {
						systemPrompt: `${event.systemPrompt}\n\n${options.config.systemPrompt}${modelWarnings}${durableContext}`,
					};
				});

				if (contextStore) {
					pi.registerTool({
						name: "subagent_record_context",
						label: "Subagent Record Context",
						description: "Record durable context for this subagent task.",
						promptSnippet: "Record durable subagent context, evidence, decisions, blockers, or relevant files",
						parameters: Type.Object({
							kind: Type.Union([
								Type.Literal("context"),
								Type.Literal("decision"),
								Type.Literal("blocker"),
								Type.Literal("evidence"),
								Type.Literal("file"),
								Type.Literal("status"),
							]),
							summary: Type.String({ minLength: 1 }),
							details: Type.Optional(Type.String()),
							files: Type.Optional(Type.Array(Type.String())),
							decisions: Type.Optional(Type.Array(Type.String())),
							blockers: Type.Optional(Type.Array(Type.String())),
						}),
						async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
							const doc = await contextStore.record({
								sessionId: ctx.sessionManager.getSessionId(),
								taskId: options.task.id,
								definitionName: options.config.name,
								entry: params,
							});
							return {
								content: [
									{ type: "text" as const, text: `Recorded subagent context entry ${doc.entries.length}.` },
								],
								details: {
									path: contextStore.getPath(ctx.sessionManager.getSessionId(), options.task.id),
									entryCount: doc.entries.length,
								},
							};
						},
					});

					pi.registerTool({
						name: "subagent_read_context",
						label: "Subagent Read Context",
						description: "Read durable context recorded for this subagent task.",
						promptSnippet: "Read durable subagent context for this task",
						parameters: Type.Object({
							limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
						}),
						async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
							const text = await contextStore.formatForPrompt(
								ctx.sessionManager.getSessionId(),
								options.task.id,
								params.limit,
							);
							return {
								content: [{ type: "text" as const, text }],
								details: { path: contextStore.getPath(ctx.sessionManager.getSessionId(), options.task.id) },
							};
						},
					});

					pi.registerTool({
						name: "subagent_record_result",
						label: "Subagent Record Result",
						description: "Record the final result for this subagent task.",
						promptSnippet: "Record the final subagent result before finishing the task",
						parameters: Type.Object({
							status: Type.Union([Type.Literal("completed"), Type.Literal("blocked")]),
							summary: Type.String({ minLength: 1 }),
							details: Type.Optional(Type.String()),
							files: Type.Optional(Type.Array(Type.String())),
							evidence: Type.Optional(Type.Array(Type.String())),
							risks: Type.Optional(Type.Array(Type.String())),
							nextStep: Type.Optional(Type.String()),
						}),
						async execute(_toolCallId, params) {
							options.recordResult?.(params);
							return {
								content: [{ type: "text" as const, text: "Recorded final subagent result." }],
								details: {
									status: params.status,
									taskId: options.task.id,
								},
							};
						},
					});

					pi.on("session_before_compact", async (event, ctx) => {
						const contextSummary = await contextStore.formatForPrompt(
							ctx.sessionManager.getSessionId(),
							options.task.id,
						);
						if (contextSummary === "No durable subagent context has been recorded.") return;

						const compactionConfig = configManager.getCompactionConfig();
						const compactionResolution = resolveConfiguredModel(
							compactionConfig?.model,
							undefined,
							ctx.modelRegistry,
						);
						const model = compactionResolution.model ?? ctx.model;
						if (!model) return;

						const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
						if (!auth.ok) return;

						const customInstructions = [
							event.customInstructions,
							`Preserve this durable subagent context in the compaction summary.\n\nTask: ${options.task.id}\nAgent: ${options.config.name}\nContext file: ${contextStore.getPath(ctx.sessionManager.getSessionId(), options.task.id)}\n\n${contextSummary}`,
						]
							.filter(Boolean)
							.join("\n\n");

						const compaction = await compact(
							event.preparation,
							model,
							auth.apiKey ?? "",
							auth.headers,
							customInstructions,
							event.signal,
						);
						return { compaction };
					});
				}

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
		model: modelResolution.model,
		thinkingLevel: options.config.thinkingLevel,
		settingsManager: options.settingsManager,
		sessionManager: SessionManager.create(cwd),
		authStorage: options.authStorage,
		modelRegistry: options.modelRegistry,
	});

	return { session };
}
