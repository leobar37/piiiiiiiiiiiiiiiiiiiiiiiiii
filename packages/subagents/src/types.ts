import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ImageContent, Model } from "@earendil-works/pi-ai";
import type {
	CompactionResult,
	ExtensionAPI,
	ExtensionFactory,
	SessionStats,
	ToolDefinition,
	ToolInfo,
} from "@earendil-works/pi-coding-agent";

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
	| "failed"
	| "cancelled"
	| "timed_out";

export interface SubAgentInstanceState {
	instanceId: string;
	taskId: string;
	definitionName: string;
	state: SubAgentState;
	startTime: number | null;
	endTime: number | null;
	turnCount: number;
	lastActivityAt: number;
	currentTool: string | null;
	error: string | null;
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
// Definition (template / base configuration)
// =============================================================================

export interface SubAgentDefinition {
	name: string;
	description: string;
	systemPrompt: string;
	capabilities: SubAgentCapabilities;
	tools?: string[];
	disabledTools?: string[];
	model?: string;
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
	cwd?: string;
	isolated?: boolean;
	extensionFactory?: ExtensionFactory;
	maxTurns?: number;
	timeout?: number;
	allowQuery?: boolean;
	verboseTools?: boolean;
}

// =============================================================================
// Effective Config (definition merged with task overrides)
// =============================================================================

export interface EffectiveSubAgentConfig {
	name: string;
	description: string;
	systemPrompt: string;
	capabilities: SubAgentCapabilities;
	tools?: string[];
	disabledTools?: string[];
	model?: string;
	thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high";
	cwd?: string;
	isolated?: boolean;
	extensionFactory?: ExtensionFactory;
	maxTurns?: number;
	timeout?: number;
	allowQuery?: boolean;
	verboseTools?: boolean;
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
	/** Override model */
	model?: string;
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

	/** Paths to files to inject as context */
	inputArtifacts?: string[];
	/** Path where the sub-agent writes its result */
	outputArtifact: string;
	/** Task IDs that must complete before this one starts */
	dependsOn?: string[];
}

// =============================================================================
// Execution Plan
// =============================================================================

export type ExecutionStrategy = "sequential" | "parallel" | "dependency-graph";

export interface ExecutionPlan {
	strategy: ExecutionStrategy;
	tasks: DelegationTask[];
}

// =============================================================================
// Result
// =============================================================================

export type DelegationStatus = "completed" | "failed" | "blocked" | "timed_out" | "cancelled";

export interface DelegationResult {
	taskId: string;
	agent: string;
	status: DelegationStatus;
	outputPath: string;
	summary: string;
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
}

export type SubAgentEventType = keyof SubAgentEventMap;
export type SubAgentEvent = SubAgentEventMap[SubAgentEventType];

// =============================================================================
// Controller Options
// =============================================================================

export interface SubAgentControllerOptions {
	definitions: SubAgentDefinition[];
	cwd: string;
	artifactsDir?: string;
	onEvent?: (event: SubAgentEvent) => void;
	onLifecycleChange?: (event: SubAgentEventMap["lifecycle.change"]) => void;
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

import type { AgentSession, AuthStorage, ModelRegistry, SettingsManager } from "@earendil-works/pi-coding-agent";

export interface CreateSubAgentSessionOptions {
	/** Effective config after merging definition + task overrides */
	config: EffectiveSubAgentConfig;
	task: DelegationTask;
	cwd: string;
	artifactsDir: string;
	eventBus: import("./event-bus.js").SubAgentEventBus;
	instanceId: string;
	authStorage?: AuthStorage;
	modelRegistry?: ModelRegistry;
	settingsManager?: SettingsManager;
}

export interface CreateSubAgentSessionResult {
	session: AgentSession;
	cleanup: () => Promise<void>;
}

export interface CreateSubAgentInstanceOptions {
	instanceId: string;
	/** Effective config after merging definition + task overrides */
	config: EffectiveSubAgentConfig;
	definition: SubAgentDefinition;
	task: DelegationTask;
	cwd: string;
	artifactsDir: string;
	eventBus: import("./event-bus.js").SubAgentEventBus;
	authStorage?: AuthStorage;
	modelRegistry?: ModelRegistry;
	settingsManager?: SettingsManager;
}

// =============================================================================
// Re-exports
// =============================================================================

export type { ExtensionAPI, ExtensionFactory, ToolDefinition, ToolInfo };
export type { AgentMessage, ThinkingLevel };
export type { ImageContent, Model };
export type { CompactionResult, SessionStats };
