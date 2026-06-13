import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type {
	AgentSession,
	AuthStorage,
	ExtensionFactory,
	ModelRegistry,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { SessionLogger } from "@local/pi-logger";
import type { SubAgentEventBus } from "./event-bus.js";
import type { TaskRecord } from "./tasks/types.js";
import type { SubAgentTransport } from "./transport/types.js";

// =============================================================================
// Lifecycle
// =============================================================================

export type SubAgentState =
	| "created"
	| "starting"
	| "running"
	| "paused"
	| "completing"
	| "completed"
	| "blocked"
	| "failed"
	| "cancelled"
	| "timed_out";

export interface SubAgentInstanceState {
	instanceId: string;
	taskId: string;
	definitionName: string;
	cwd: string;
	parentThreadId?: string;
	parentToolCallId?: string;
	runId?: string;
	runIndex?: number;
	description?: string;
	state: SubAgentState;
	startTime: number | null;
	endTime: number | null;
	turnCount: number;
	lastActivityAt: number;
	currentTool: string | null;
	error: string | null;
	toolCount: number;
	currentToolStartedAt: number | null;
	durationMs: number;
	sessionId?: string;
	sessionFile?: string;
	modelProvider?: string;
	modelId?: string;
}

// =============================================================================
// Capabilities
// =============================================================================

export interface SubAgentCapabilities {
	canEdit: boolean;
	canExecute: boolean;
	canWrite: boolean;
	canResearch: boolean;
}

// =============================================================================
// Instruction Builder (customizable instruction generation)
// =============================================================================

export interface InstructionContext {
	/** The full task with all overrides */
	task: DelegationTask;
	/** The effective config after merging definition + task overrides */
	config: EffectiveSubAgentConfig;
	/** Orchestration metadata supplied by Lion or another delegating runtime. */
	orchestration?: SubAgentOrchestrationContext;
}

export type InstructionBuilder = (ctx: InstructionContext) => string;

// =============================================================================
// Definition (template / base configuration)
// =============================================================================

export interface SubAgentDefinition {
	name: string;
	description: string;
	systemPrompt: string;
	capabilities: SubAgentCapabilities;
	tools?: string[];
	disabledTools?: string[];
	/** Extra skill files or directories to force-load for this definition. */
	skillPaths?: string[];
	model?: string;
	fallbackModels?: string[];
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
	cwd?: string;
	isolated?: boolean;
	extensionFactory?: ExtensionFactory;
	maxTurns?: number;
	timeout?: number;
	allowQuery?: boolean;
	verboseTools?: boolean;
	/** Custom instruction builder for this agent type. Falls back to DEFAULT_BUILDER. */
	instructionBuilder?: InstructionBuilder;
}

// =============================================================================
// Effective Config (definition merged with task overrides; identical shape)
// =============================================================================

export type EffectiveSubAgentConfig = SubAgentDefinition;

export interface SubAgentOrchestrationContext {
	strategy: "plan" | "simple" | "review" | "none";
	planSlug?: string;
	planPath?: string;
}

// =============================================================================
// DelegationTask (with dynamic overrides)
// =============================================================================

export interface DelegationTask {
	/** Unique task identifier */
	id: string;
	/** Name of the SubAgentDefinition to use as base template */
	definition: string;
	/** Task instructions (the "what to do") */
	prompt: string;
	/** Parent dashboard thread that created this task, when delegated from another session. */
	parentThreadId?: string;
	/** Parent tool call that created this task, when delegated from another session. */
	parentToolCallId?: string;
	/** Logical grouped run id for multi-task delegation. */
	runId?: string;
	/** Position of this task inside the delegated run. */
	runIndex?: number;
	/** Orchestration metadata used to adapt subagent instructions. */
	orchestration?: SubAgentOrchestrationContext;

	/** --- Dynamic overrides (all optional) --- */

	/** Contextual description of this specific task (for logs/events) */
	description?: string;
	/** Additional or replacement system prompt */
	systemPrompt?: string;
	/** How to merge task.systemPrompt with definition.systemPrompt. Default: "append" */
	systemPromptMode?: "replace" | "append" | "prepend";
	/** Partial capabilities that override/merge with the definition */
	capabilities?: Partial<SubAgentCapabilities>;
	/** Override tool allowlist */
	tools?: string[];
	/** Additional tools to disable (merged with definition.disabledTools) */
	disabledTools?: string[];
	/** Extra skill files or directories to force-load for this task. */
	skillPaths?: string[];
	/** Override model */
	model?: string;
	/** Override fallback models tried when the primary model is unavailable */
	fallbackModels?: string[];
	/** Override thinking level */
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
	/** Override max turns */
	maxTurns?: number;
	/** Override timeout */
	timeout?: number;
	/** Override allowQuery */
	allowQuery?: boolean;
	/** Override verboseTools */
	verboseTools?: boolean;
	/** Custom instruction builder for this specific task. Overrides definition.instructionBuilder. */
	instructionBuilder?: InstructionBuilder;

	/** Paths to files to inject as context */
	inputArtifacts?: string[];
	/** Path where the sub-agent writes its result (optional, only when using an artifact store) */
	outputArtifact?: string;
	/** Task IDs that must complete before this one starts */
	dependsOn?: string[];
}

// =============================================================================
// Execution Plan
// =============================================================================

export type ExecutionStrategy = "sequential" | "parallel" | "chain";

export interface ExecutionPlan {
	strategy: ExecutionStrategy;
	tasks: DelegationTask[];
	concurrency?: number;
	chainOptions?: {
		passOutputToNext?: boolean;
		outputMode?: "append" | "replace" | "template";
		template?: string;
		stopOnFailure?: boolean;
	};
}

// =============================================================================
// Result
// =============================================================================

export type DelegationStatus = "completed" | "failed" | "blocked" | "timed_out" | "cancelled";

export interface DelegationResult {
	taskId: string;
	agent: string;
	status: DelegationStatus;
	summary: string;
	structuredResult: boolean;
	recordedResult?: RecordSubAgentResultInput;
	duration: number;
	error?: string;
	turnCount: number;
	finalState: SubAgentInstanceState;
}

// =============================================================================
// Events
// =============================================================================

export interface SubAgentEventMap {
	"lifecycle.change": {
		type: "lifecycle.change";
		instanceId: string;
		previous: SubAgentState;
		current: SubAgentState;
		timestamp: number;
	};

	"task.start": {
		type: "task.start";
		instanceId: string;
		taskId: string;
		definitionName: string;
		parentThreadId?: string;
		parentToolCallId?: string;
		runId?: string;
		runIndex?: number;
		description?: string;
		timestamp: number;
	};

	"task.end": {
		type: "task.end";
		instanceId: string;
		taskId: string;
		result: DelegationResult;
		timestamp: number;
	};

	"turn.complete": {
		type: "turn.complete";
		instanceId: string;
		taskId: string;
		turnIndex: number;
		toolCount: number;
		hadError: boolean;
		timestamp: number;
	};

	"tool.start": {
		type: "tool.start";
		instanceId: string;
		taskId: string;
		toolName: string;
		toolCallId: string;
		timestamp: number;
	};

	"tool.end": {
		type: "tool.end";
		instanceId: string;
		taskId: string;
		toolName: string;
		toolCallId: string;
		isError: boolean;
		timestamp: number;
	};

	"instance.created": {
		type: "instance.created";
		instanceId: string;
		taskId: string;
		definitionName: string;
		parentThreadId?: string;
		parentToolCallId?: string;
		runId?: string;
		runIndex?: number;
		timestamp: number;
	};

	"instance.state": {
		type: "instance.state";
		instanceId: string;
		taskId: string;
		state: SubAgentInstanceState;
		timestamp: number;
	};

	"instance.session": {
		type: "instance.session";
		instanceId: string;
		taskId: string;
		sessionId: string;
		sessionFile?: string;
		timestamp: number;
	};

	"tool.execute": {
		type: "tool.execute";
		instanceId: string;
		taskId: string;
		toolName: string;
		toolCallId: string;
		isError: boolean;
		timestamp: number;
	};

	"progress.update": {
		type: "progress.update";
		instanceId: string;
		taskId: string;
		message: string;
		timestamp: number;
	};

	"query.response": {
		type: "query.response";
		instanceId: string;
		taskId: string;
		queryId: string;
		question: string;
		answer: string;
		timestamp: number;
	};

	"summary.available": {
		type: "summary.available";
		instanceId: string;
		taskId: string;
		summary: string;
		messageCount: number;
		timestamp: number;
	};

	error: {
		type: "error";
		instanceId: string;
		taskId: string;
		error: string;
		fatal: boolean;
		timestamp: number;
	};

	"session.event": {
		type: "session.event";
		instanceId: string;
		taskId: string;
		/** Raw AgentSessionEvent from the underlying coding-agent session */
		sessionEvent: Record<string, unknown>;
		timestamp: number;
	};

	"session.message.complete": {
		type: "session.message.complete";
		instanceId: string;
		taskId: string;
		/** Full message at message_end, for persistence without deltas */
		message: AgentMessage;
		timestamp: number;
	};

	"session.snapshot": {
		type: "session.snapshot";
		instanceId: string;
		taskId: string;
		/** Full resolved session messages, used to repair missed incremental events. */
		messages: AgentMessage[];
		timestamp: number;
	};

	"task.changed": {
		type: "task.changed";
		action: "created" | "updated" | "completed" | "blocked" | "deleted";
		taskId: string;
		task: TaskRecord;
		timestamp: number;
		instanceId?: undefined;
	};
}

export type SubAgentEventType =
	| "lifecycle.change"
	| "task.start"
	| "task.end"
	| "turn.complete"
	| "tool.start"
	| "tool.end"
	| "tool.execute"
	| "progress.update"
	| "query.response"
	| "summary.available"
	| "error"
	| "instance.created"
	| "instance.state"
	| "instance.session"
	| "session.event"
	| "session.message.complete"
	| "session.snapshot"
	| "task.changed";
export type SubAgentEvent = SubAgentEventMap[SubAgentEventType];

// =============================================================================
// Artifact Store (optional addon)
// =============================================================================

export interface SubAgentArtifactStore {
	saveResult(taskId: string, result: DelegationResult): Promise<void>;
	saveEventLog(taskId: string, events: SubAgentEvent[]): Promise<void>;
	readResult(taskId: string): Promise<string | null>;
}

// =============================================================================
// Controller Options
// =============================================================================

export interface SubAgentControllerOptions {
	definitions: SubAgentDefinition[];
	cwd: string;
	artifactStore?: SubAgentArtifactStore;
	authStorage?: AuthStorage;
	modelRegistry?: ModelRegistry;
	settingsManager?: SettingsManager;
	logger?: SessionLogger;
	onEvent?: (event: SubAgentEvent) => void;
	onLifecycleChange?: (event: SubAgentEventMap["lifecycle.change"]) => void;
	transports?: SubAgentTransport[];
	configManager?: SubAgentRuntimeConfigManager;
	contextStore?: SubAgentContextStore;
	runStore?: SubAgentRunStore;
}

export interface SubAgentRoleConfig {
	model?: string;
	fallbackModels?: string[];
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
}

export interface SubAgentCompactionConfig {
	model?: string;
}

export interface SubAgentProjectConfig {
	agents?: Record<string, SubAgentRoleConfig>;
	compaction?: SubAgentCompactionConfig;
}

export interface SubAgentRuntimeConfigManager {
	getAgentConfig(name: string): SubAgentRoleConfig | undefined;
	getCompactionConfig(): SubAgentCompactionConfig | undefined;
}

export interface SubAgentContextEntry {
	id: string;
	kind: "context" | "decision" | "blocker" | "evidence" | "file" | "status";
	summary: string;
	details?: string;
	files: string[];
	decisions: string[];
	blockers: string[];
	createdAt: number;
}

export interface SubAgentContextDocument {
	version: 1;
	sessionId: string;
	taskId: string;
	definitionName: string;
	cwd: string;
	createdAt: number;
	updatedAt: number;
	entries: SubAgentContextEntry[];
}

export interface RecordSubAgentContextInput {
	kind: SubAgentContextEntry["kind"];
	summary: string;
	details?: string;
	files?: string[];
	decisions?: string[];
	blockers?: string[];
}

export interface RecordSubAgentResultInput {
	status: Extract<DelegationStatus, "completed" | "blocked">;
	summary: string;
	details?: string;
	files?: string[];
	evidence?: string[];
	risks?: string[];
	nextStep?: string;
}

export interface SubAgentContextStore {
	getPath(sessionId: string, taskId: string): string;
	read(sessionId: string, taskId: string): Promise<SubAgentContextDocument | null>;
	record(input: {
		sessionId: string;
		taskId: string;
		definitionName: string;
		entry: RecordSubAgentContextInput;
	}): Promise<SubAgentContextDocument>;
	formatForPrompt(sessionId: string, taskId: string, limit?: number): Promise<string>;
}

export interface SubAgentRunRecord {
	version: 1;
	sessionId: string;
	taskId: string;
	instanceId: string;
	definitionName: string;
	cwd: string;
	parentThreadId?: string;
	parentToolCallId?: string;
	runId?: string;
	runIndex?: number;
	description?: string;
	prompt: string;
	systemPrompt?: string;
	modelProvider?: string;
	modelId?: string;
	status: DelegationStatus | "running";
	summary?: string;
	recordedResult?: RecordSubAgentResultInput;
	error?: string;
	startedAt: number;
	updatedAt: number;
	completedAt?: number;
	turnCount: number;
	toolCount: number;
}

export interface SubAgentRunListFilters {
	status?: SubAgentRunRecord["status"];
	runId?: string;
	definitionName?: string;
	sessionId?: string;
}

export interface SubAgentRunStore {
	getPath(sessionId: string, taskId: string): string;
	read(sessionId: string, taskId: string): Promise<SubAgentRunRecord | null>;
	list(filters?: SubAgentRunListFilters): Promise<SubAgentRunRecord[]>;
	start(input: {
		sessionId: string;
		taskId: string;
		instanceId: string;
		definitionName: string;
		cwd: string;
		parentThreadId?: string;
		parentToolCallId?: string;
		runId?: string;
		runIndex?: number;
		description?: string;
		prompt: string;
		systemPrompt?: string;
		modelProvider?: string;
		modelId?: string;
		startedAt?: number;
	}): Promise<SubAgentRunRecord>;
	complete(input: {
		sessionId: string;
		taskId: string;
		status: DelegationStatus;
		summary: string;
		recordedResult?: RecordSubAgentResultInput;
		error?: string;
		completedAt?: number;
		turnCount: number;
		toolCount: number;
		modelProvider?: string;
		modelId?: string;
	}): Promise<SubAgentRunRecord | null>;
}

// =============================================================================
// Query
// =============================================================================

export interface QueryRequest {
	queryId: string;
	question: string;
	timeoutMs?: number;
}

export interface QueryResponse {
	queryId: string;
	question: string;
	answer: string;
	duration: number;
	failed: boolean;
}

// =============================================================================
// Summary
// =============================================================================

export interface SummarizerOptions {
	maxMessages?: number;
	maxTurns?: number;
	includeTools?: boolean;
	useAI?: boolean;
	prompt?: string;
}

export interface ConversationSummary {
	messageCount: number;
	turnCount: number;
	toolCallCount: number;
	text: string;
	lastMessageAt: number;
}

// =============================================================================
// Bash Result (not publicly exported from pi-coding-agent, defined locally)
// =============================================================================

export interface BashResult {
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
}

// =============================================================================
// RPC State (mirrors RpcSessionState)
// =============================================================================

export interface SubAgentRpcState {
	model?: Model<any>;
	thinkingLevel: ThinkingLevel;
	isStreaming: boolean;
	isCompacting: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	sessionFile?: string;
	sessionId: string;
	sessionName?: string;
	autoCompactionEnabled: boolean;
	messageCount: number;
	pendingMessageCount: number;
}

// =============================================================================
// Session Factory
// =============================================================================

export interface CreateSubAgentSessionOptions {
	/** Effective config after merging definition + task overrides */
	config: EffectiveSubAgentConfig;
	task: DelegationTask;
	/** Already-resolved cwd (after workspace resolution, may be a worktree) */
	cwd: string;
	/** Root cwd used to load project resources such as .codex/skills and prompts. */
	resourceCwd: string;
	eventBus: SubAgentEventBus;
	instanceId: string;
	authStorage?: AuthStorage;
	modelRegistry?: ModelRegistry;
	settingsManager?: SettingsManager;
	configManager?: SubAgentRuntimeConfigManager;
	contextStore?: SubAgentContextStore;
	runStore?: SubAgentRunStore;
	recordResult?: (input: RecordSubAgentResultInput) => void;
}

export interface CreateSubAgentSessionResult {
	session: AgentSession;
}

export interface CreateSubAgentInstanceOptions {
	instanceId: string;
	/** Effective config after merging definition + task overrides */
	config: EffectiveSubAgentConfig;
	definition: SubAgentDefinition;
	task: DelegationTask;
	cwd: string;
	resourceCwd: string;
	eventBus: SubAgentEventBus;
	authStorage?: AuthStorage;
	modelRegistry?: ModelRegistry;
	settingsManager?: SettingsManager;
	logger?: SessionLogger;
	configManager?: SubAgentRuntimeConfigManager;
	contextStore?: SubAgentContextStore;
	runStore?: SubAgentRunStore;
}
