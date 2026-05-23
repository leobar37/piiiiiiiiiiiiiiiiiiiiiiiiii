import { Type } from "typebox";

export const ThinkLevelSchema = Type.Union([
	Type.Literal("off"),
	Type.Literal("minimal"),
	Type.Literal("low"),
	Type.Literal("medium"),
	Type.Literal("high"),
]);

export const StrategySchema = Type.Union([Type.Literal("sequential"), Type.Literal("parallel")]);

export const RunParams = Type.Object({
	agent: Type.String({
		description: "Sub-agent definition name, for example analyzer, planner, executor, or reviewer.",
	}),
	prompt: Type.String({ description: "Task prompt for the child agent." }),
	id: Type.Optional(Type.String({ description: "Optional stable task id. Generated when omitted." })),
	description: Type.Optional(Type.String({ description: "Short description for status and logs." })),
	systemPrompt: Type.Optional(Type.String({ description: "Extra system prompt for this task." })),
	systemPromptMode: Type.Optional(
		Type.Union([Type.Literal("append"), Type.Literal("prepend"), Type.Literal("replace")]),
	),
	tools: Type.Optional(Type.Array(Type.String(), { description: "Optional tool allowlist for this run." })),
	disabledTools: Type.Optional(Type.Array(Type.String(), { description: "Tools to disable for this run." })),
	thinkingLevel: Type.Optional(ThinkLevelSchema),
	maxTurns: Type.Optional(Type.Number()),
	timeout: Type.Optional(Type.Number()),
	wait: Type.Optional(Type.Boolean({ description: "Wait for completion before returning. Defaults to true." })),
});

export const PlanTaskSchema = Type.Object({
	id: Type.String(),
	agent: Type.String(),
	prompt: Type.String(),
	description: Type.Optional(Type.String()),
	systemPrompt: Type.Optional(Type.String()),
	systemPromptMode: Type.Optional(
		Type.Union([Type.Literal("append"), Type.Literal("prepend"), Type.Literal("replace")]),
	),
	tools: Type.Optional(Type.Array(Type.String())),
	disabledTools: Type.Optional(Type.Array(Type.String())),
	thinkingLevel: Type.Optional(ThinkLevelSchema),
	dependsOn: Type.Optional(Type.Array(Type.String())),
});

export const RunPlanParams = Type.Object({
	strategy: StrategySchema,
	tasks: Type.Array(PlanTaskSchema),
	wait: Type.Optional(Type.Boolean({ description: "Wait for completion before returning. Defaults to true." })),
});

export const TaskIdParams = Type.Object({
	id: Type.String({ description: "Sub-agent task id." }),
});

export const PromptParams = Type.Object({
	id: Type.String({ description: "Sub-agent task id." }),
	message: Type.String({ description: "Message to send to the retained sub-agent." }),
	mode: Type.Optional(Type.Union([Type.Literal("prompt"), Type.Literal("follow_up"), Type.Literal("steer")])),
});

export const StatusParams = Type.Object({
	id: Type.Optional(Type.String({ description: "Optional task id to inspect." })),
});
