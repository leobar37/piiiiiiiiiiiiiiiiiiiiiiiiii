import { z } from "zod";

// =============================================================================
// Enums
// =============================================================================

export const SubAgentStateSchema = z.enum([
	"created",
	"starting",
	"running",
	"paused",
	"completing",
	"completed",
	"blocked",
	"failed",
	"cancelled",
	"timed_out",
]);

export const DashboardThreadKindSchema = z.enum(["main", "subagent"]);

export const LionChecklistKindSchema = z.enum(["plan", "review"]);

export const LionTaskStatusSchema = z.enum(["pending", "in_progress", "complete", "blocked", "retryable"]);

export const DashboardTaskStatusSchema = z.enum(["pending", "in_progress", "blocked", "completed", "deleted"]);

// =============================================================================
// Inputs
// =============================================================================

export const ThreadIdInputSchema = z.object({
	threadId: z.string(),
});

export const ThreadPromptModeSchema = z.enum(["prompt", "follow_up", "steer"]);

const ThreadPromptImageSchema = z.object({
	type: z.literal("image"),
	data: z.string().trim().min(1),
	mimeType: z.string().trim().min(1),
	name: z.string().optional(),
});

export const ThreadPromptInputSchema = z
	.object({
		threadId: z.string(),
		message: z.string(),
		mode: ThreadPromptModeSchema,
		images: z.array(ThreadPromptImageSchema).optional(),
	})
	.refine((input) => input.message.trim().length > 0 || (input.images?.length ?? 0) > 0, {
		message: "Message or image is required",
		path: ["message"],
	});

export const ThreadCreateInputSchema = z.object({
	name: z.string().trim().min(1).optional(),
	cwd: z.string().trim().min(1).optional(),
});

export const ThreadCreateResultSchema = z.object({
	threadId: z.string(),
	name: z.string(),
	createdAt: z.number(),
	cwd: z.string(),
});

export const ThreadModelInputSchema = z.object({
	threadId: z.string(),
	provider: z.string().trim().min(1),
	modelId: z.string().trim().min(1),
});

export const ChecklistInputSchema = z.object({
	kind: LionChecklistKindSchema,
	reference: z.string().optional(),
});

export const DashboardLogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const DashboardLogQuerySchema = z.object({
	sessionId: z.string().trim().min(1).optional(),
	threadId: z.string().trim().min(1).optional(),
	type: z.string().trim().min(1).optional(),
	level: DashboardLogLevelSchema.optional(),
	since: z.number().optional(),
	until: z.number().optional(),
	limit: z.number().int().min(1).max(1000).optional(),
});

export const DashboardTaskContextSchema = z.object({
	why: z.string().trim().min(1).optional(),
	files: z.array(z.string().trim().min(1)).optional(),
	doneWhen: z.array(z.string().trim().min(1)).optional(),
	notes: z.string().trim().min(1).optional(),
});

export const DashboardTaskSchema = z.object({
	id: z.string(),
	title: z.string(),
	status: DashboardTaskStatusSchema,
	createdAt: z.string(),
	updatedAt: z.string(),
	completedAt: z.string().optional(),
	revision: z.number(),
	assignedToSession: z.string().optional(),
	context: DashboardTaskContextSchema.optional(),
});

export const TaskListInputSchema = z.object({
	includeDeleted: z.boolean().optional(),
});

export const TaskIdInputSchema = z.object({
	id: z.string().trim().min(1),
});

export const TaskCreateInputSchema = z.object({
	title: z.string().trim().min(1),
	status: DashboardTaskStatusSchema.optional(),
	assignedToSession: z.string().trim().min(1).optional(),
	actorSessionId: z.string().trim().min(1).optional(),
	context: DashboardTaskContextSchema.optional(),
});

export const TaskUpdateInputSchema = z.object({
	id: z.string().trim().min(1),
	title: z.string().trim().min(1).optional(),
	status: DashboardTaskStatusSchema.optional(),
	assignedToSession: z.string().trim().min(1).nullable().optional(),
	actorSessionId: z.string().trim().min(1).optional(),
	context: DashboardTaskContextSchema.optional(),
	expectedRevision: z.number().int().min(1).optional(),
});

export const TaskBlockInputSchema = z.object({
	id: z.string().trim().min(1),
	reason: z.string().trim().min(1),
	actorSessionId: z.string().trim().min(1).optional(),
	expectedRevision: z.number().int().min(1).optional(),
});

export const TaskMutationResultSchema = z.object({
	task: DashboardTaskSchema,
});

// =============================================================================
// Lion
// =============================================================================

export const DashboardLionStateSchema = z.object({
	active: z.boolean(),
	strategy: z.enum(["plan", "simple", "review", "none"]),
	phase: z.enum(["planning", "building"]),
	activePlanPath: z.string().nullable(),
	activePlanSlug: z.string().nullable(),
	planKind: z.enum(["structured", "overview"]).nullable(),
	activeTaskId: z.string().nullable(),
	lastRunId: z.string().nullable(),
});

export const LionStrategyNameSchema = z.enum(["plan", "simple", "review", "none"]);

export const LionSetStrategyInputSchema = z.object({
	strategy: LionStrategyNameSchema,
});

export const LionSetStrategyResultSchema = z.object({
	strategy: LionStrategyNameSchema,
	previousStrategy: LionStrategyNameSchema,
	acceptedAt: z.number(),
});

export const LionChecklistProgressSchema = z.object({
	completed: z.number(),
	total: z.number(),
	pending: z.number(),
	inProgress: z.number(),
	blocked: z.number(),
	retryable: z.number(),
	percent: z.number(),
});

export const LionTaskSchema = z.object({
	id: z.string(),
	title: z.string(),
	file: z.string(),
	status: LionTaskStatusSchema,
	dependencies: z.array(z.string()),
	requirements: z.array(z.string()),
	phase: z.string().optional(),
	scope: z.array(z.string()).optional(),
	kind: z.string().optional(),
	last_summary: z.string().optional(),
	updated_at: z.string().optional(),
});

export const LionChecklistSnapshotSchema = z.object({
	kind: LionChecklistKindSchema,
	slug: z.string(),
	rootPath: z.string(),
	checklistFile: z.string(),
	tasks: z.array(LionTaskSchema),
	progress: LionChecklistProgressSchema,
	updatedAt: z.string().nullable(),
});

// =============================================================================
// Threads
// =============================================================================

export const DashboardThreadStateSchema = z.object({
	instanceId: z.string(),
	taskId: z.string(),
	definitionName: z.string(),
	cwd: z.string(),
	parentThreadId: z.string().optional(),
	parentToolCallId: z.string().optional(),
	runId: z.string().optional(),
	runIndex: z.number().optional(),
	description: z.string().optional(),
	state: SubAgentStateSchema,
	startTime: z.number().nullable(),
	endTime: z.number().nullable(),
	turnCount: z.number(),
	lastActivityAt: z.number(),
	currentTool: z.string().nullable(),
	error: z.string().nullable(),
	toolCount: z.number(),
	currentToolStartedAt: z.number().nullable(),
	durationMs: z.number(),
	kind: DashboardThreadKindSchema,
	isLive: z.boolean().optional(),
	sessionFile: z.string().optional(),
	sessionId: z.string().optional(),
	modelProvider: z.string().optional(),
	modelId: z.string().optional(),
	orchestration: z
		.object({
			strategy: z.enum(["plan", "simple", "review", "none"]),
			planSlug: z.string().optional(),
			planPath: z.string().optional(),
		})
		.optional(),
});

export const SubAgentRunRecordSchema = z.object({
	version: z.literal(1),
	sessionId: z.string(),
	taskId: z.string(),
	instanceId: z.string(),
	definitionName: z.string(),
	cwd: z.string(),
	parentThreadId: z.string().optional(),
	parentToolCallId: z.string().optional(),
	runId: z.string().optional(),
	runIndex: z.number().optional(),
	description: z.string().optional(),
	prompt: z.string(),
	systemPrompt: z.string().optional(),
	modelProvider: z.string().optional(),
	modelId: z.string().optional(),
	status: z.enum(["running", "completed", "failed", "blocked", "timed_out", "cancelled"]),
	summary: z.string().optional(),
	error: z.string().optional(),
	startedAt: z.number(),
	updatedAt: z.number(),
	completedAt: z.number().optional(),
	turnCount: z.number(),
	toolCount: z.number(),
});

export const DashboardCommandSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	source: z.enum(["extension", "prompt", "skill"]),
});

export const DashboardModelSchema = z.object({
	provider: z.string(),
	id: z.string(),
	name: z.string(),
	api: z.string(),
	reasoning: z.boolean(),
});

export const ThreadPromptResultSchema = z.object({
	threadId: z.string(),
	mode: ThreadPromptModeSchema,
	status: z.literal("sent"),
	acceptedAt: z.number(),
});

export const ThreadAbortInputSchema = z.object({
	threadId: z.string(),
});

export const ThreadModelResultSchema = z.object({
	threadId: z.string(),
	provider: z.string(),
	modelId: z.string(),
	status: z.literal("selected"),
	selectedAt: z.number(),
});

export const DashboardLogEntrySchema = z.object({
	timestamp: z.number(),
	sessionId: z.string(),
	threadId: z.string().optional(),
	type: z.string(),
	source: z.string(),
	level: DashboardLogLevelSchema,
	data: z.record(z.unknown()),
});

export const DashboardLogSessionSummarySchema = z.object({
	sessionId: z.string(),
	entryCount: z.number(),
	firstTimestamp: z.number().nullable(),
	lastTimestamp: z.number().nullable(),
	updatedAt: z.number(),
});

// =============================================================================
// Messages
// =============================================================================

const TextContentSchema = z.object({
	type: z.literal("text"),
	text: z.string(),
	textSignature: z.string().optional(),
});

const ImageContentSchema = z.object({
	type: z.literal("image"),
	data: z.string(),
	mimeType: z.string(),
});

const ThinkingContentSchema = z.object({
	type: z.literal("thinking"),
	thinking: z.string(),
	thinkingSignature: z.string().optional(),
	redacted: z.boolean().optional(),
});

const ToolCallContentSchema = z.object({
	type: z.literal("toolCall"),
	id: z.string(),
	name: z.string(),
	arguments: z.record(z.unknown()),
	thoughtSignature: z.string().optional(),
});

const UserMessageSchema = z.object({
	role: z.literal("user"),
	content: z.union([z.string(), z.array(z.union([TextContentSchema, ImageContentSchema]))]),
	timestamp: z.number(),
});

const AssistantMessageSchema = z.object({
	role: z.literal("assistant"),
	content: z.array(z.union([TextContentSchema, ThinkingContentSchema, ToolCallContentSchema])),
	api: z.string().optional(),
	provider: z.string().optional(),
	model: z.string().optional(),
	responseModel: z.string().optional(),
	responseId: z.string().optional(),
	usage: z
		.object({
			inputTokens: z.number().optional(),
			outputTokens: z.number().optional(),
			totalTokens: z.number().optional(),
		})
		.optional(),
	stopReason: z.enum(["stop", "length", "toolUse", "error", "aborted"]).optional(),
	errorMessage: z.string().optional(),
	timestamp: z.number(),
});

const ToolResultMessageSchema = z.object({
	role: z.literal("toolResult"),
	toolCallId: z.string(),
	toolName: z.string(),
	content: z.array(z.union([TextContentSchema, ImageContentSchema])),
	details: z.unknown().optional(),
	isError: z.boolean(),
	timestamp: z.number(),
});

const BashExecutionMessageSchema = z.object({
	role: z.literal("bashExecution"),
	command: z.string(),
	output: z.string(),
	exitCode: z.number().optional(),
	cancelled: z.boolean(),
	timestamp: z.number(),
});

const CustomMessageSchema = z.object({
	role: z.literal("custom"),
	customType: z.string(),
	content: z.union([z.string(), z.array(z.union([TextContentSchema, ImageContentSchema]))]),
	timestamp: z.number(),
});

export const AgentMessageSchema = z.union([
	UserMessageSchema,
	AssistantMessageSchema,
	ToolResultMessageSchema,
	BashExecutionMessageSchema,
	CustomMessageSchema,
	z
		.object({
			role: z.string(),
			timestamp: z.number(),
		})
		.catchall(z.unknown()),
]);

// =============================================================================
// Events
// =============================================================================

export const SubAgentEventSchema = z
	.object({
		type: z.string(),
		timestamp: z.number(),
		instanceId: z.string().optional(),
		taskId: z.string().optional(),
	})
	.catchall(z.unknown());
