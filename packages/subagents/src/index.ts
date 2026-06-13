/**
 * Environment variables:
 * - `LION_DASHBOARD_MODE=true` — Disables the standalone Lion frontend UI.
 *   Set automatically by the web dashboard so Lion does not conflict on ports.
 */

// Config

export type { SubagentsApiContext } from "./api/context.js";
export type { SubagentsContract } from "./api/contract.js";
export { subagentsContract } from "./api/contract.js";
export { createSubagentsRouter } from "./api/router.js";
export type { SubagentsInputs, SubagentsOutputs } from "./api/types.js";
export {
	findConfigPath,
	loadConfig,
	loadConfigManager,
	PI_CONFIG_FILE,
} from "./config-loader.js";
export {
	resolveConfiguredModel,
	SubAgentConfigManager,
} from "./config-manager.js";
export { resolveEffectiveConfig } from "./config-resolver.js";
export { SubAgentContextStore } from "./context-store.js";
// Controller
export { SubAgentController } from "./controller.js";
// Built-in definitions
export {
	analyzerDefinition,
	BUILTIN_DEFINITIONS,
	executorDefinition,
	plannerDefinition,
	reviewerDefinition,
} from "./definitions/index.js";
// Event bus
export { EventBusBase, SubAgentEventBus } from "./event-bus.js";

// File-system artifact store (optional addon)
export { FsArtifactStore } from "./fs-artifact-store.js";
// Instance
export { SubAgentInstance } from "./instance.js";
// Instruction builders
export {
	ANALYZER_BUILDER,
	DEFAULT_BUILDER,
	EXECUTOR_BUILDER,
	PLANNER_BUILDER,
	REVIEWER_BUILDER,
} from "./instructions/index.js";
export type { InstructionBuilder, InstructionContext } from "./instructions/types.js";
export { registerLionCommands } from "./lion/commands.js";
export type { LionCore, LionRun, LionRunStatus, LionSubagentRole } from "./lion/core.js";
export {
	createLionCore,
	finishRun,
	markAwaitingOrchestrator,
	recordReviewVerdict,
	recordSubagentResult,
	setRunStatus,
	snapshot,
	startRun,
} from "./lion/core.js";
export { LionEvents, LionRuntimeEventBus } from "./lion/events/index.js";
// Lion orchestration
export { lionExtension } from "./lion/index.js";
export { MainSessionBridge } from "./lion/main-session.js";
export {
	buildCorrectionPrompt,
	buildExecutorPrompt,
	buildPlanningSystemPrompt,
	buildPlanReviewPrompt,
	buildReviewerPrompt,
} from "./lion/prompts/index.js";
export { LionRuntime } from "./lion/runtime.js";
export { readLionState, writeLionState } from "./lion/state-store.js";
export type { LionToolResponse } from "./lion/tools.js";
export { registerLionTools } from "./lion/tools.js";
export type {
	LionBuildResult,
	LionEvent,
	LionEventBase,
	LionEventMap,
	LionEventType,
	LionPhase,
	LionPlan,
	LionPlanKind,
	LionReviewVerdict,
	LionState,
	LionStrategyName,
	LionTask,
	LionTaskResult,
	LionTaskStatus,
	LionTaskStrategy,
	LionTasksResult,
} from "./lion/types.js";
export {
	buildLionSubagentWidgetLines,
	renderLionSubagentWidget,
	stopLionSubagentWidget,
} from "./lion/ui/subagents-widget.js";
export { parseReviewVerdict } from "./lion/utils.js";
export { SubAgentRunStore } from "./run-store.js";
// Session factory
export { createSubAgentSession } from "./session-factory.js";
// Summarizer
export { SubAgentSummarizer } from "./summarizer.js";
export type { TaskExecutionResult, TaskExecutorOptions } from "./task-executor.js"; // Types
export { TaskExecutor } from "./task-executor.js";
export { TaskService } from "./tasks/service.js";
export type { TaskListOptions } from "./tasks/store.js";
export {
	formatTaskId,
	isTaskClosed,
	isTaskStoreError,
	normalizeTaskId,
	resolveTodosDir,
	resolveTodosDirLabel,
	TaskStore,
	toTaskStatus,
	validateTaskId,
} from "./tasks/store.js";
export type {
	CreateTaskInput,
	LockInfo,
	TaskChangeEvent,
	TaskContext,
	TaskEvent,
	TaskEventType,
	TaskPatch,
	TaskRecord,
	TaskSnapshot,
	TaskStatus,
	TaskStoreError,
	TaskStoreResult,
	UpdateTaskInput,
} from "./tasks/types.js";
export { TASK_STATUSES } from "./tasks/types.js";
export type { HttpServerTransportOptions } from "./transport/http-server.js";
// Transport
export { HttpServerTransport } from "./transport/http-server.js";
export type {
	DashboardSessionSource,
	DashboardThreadKind,
	DashboardThreadState,
	SubAgentTransport,
	SubAgentTransportEvent,
} from "./transport/types.js";
export type {
	ConversationSummary,
	CreateSubAgentInstanceOptions,
	CreateSubAgentSessionOptions,
	CreateSubAgentSessionResult,
	DelegationResult,
	DelegationStatus,
	DelegationTask,
	EffectiveSubAgentConfig,
	ExecutionPlan,
	ExecutionStrategy,
	QueryRequest,
	QueryResponse,
	SubAgentArtifactStore,
	SubAgentCapabilities,
	SubAgentCompactionConfig,
	SubAgentContextDocument,
	SubAgentContextEntry,
	SubAgentContextStore as SubAgentContextStoreContract,
	SubAgentControllerOptions,
	SubAgentDefinition,
	SubAgentEvent,
	SubAgentEventMap,
	SubAgentEventType,
	SubAgentInstanceState,
	SubAgentProjectConfig,
	SubAgentRoleConfig,
	SubAgentRpcState,
	SubAgentRunRecord,
	SubAgentRunStore as SubAgentRunStoreContract,
	SubAgentRuntimeConfigManager,
	SubAgentState,
	SummarizerOptions,
} from "./types.js";
export type {
	SubAgentWorkspaceHandle,
	SubAgentWorkspaceOptions,
	WorktreeEntry,
} from "./workspace/index.js";
export { SubAgentWorkspace } from "./workspace/index.js";
