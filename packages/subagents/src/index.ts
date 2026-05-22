// Config resolver
export { resolveEffectiveConfig } from "./config-resolver.js";
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
export { SubAgentEventBus } from "./event-bus.js";
export type { AnyEventCreator, EventCreator, TypedEvent } from "./event-core.js";
// Event primitives
export { createEvent, TypedEventBus } from "./event-core.js";
// SubAgent event definitions
export { SubAgentEvents } from "./event-defs.js";
// Execution strategies
export {
	execute,
	executeParallel,
	executeSequential,
} from "./execution/index.js";
// File-system artifact store (optional addon)
export { FsArtifactStore } from "./fs-artifact-store.js";
// Extension factory
// export { default as subagentsExtension } from "./extensions/subagents/index.js";
// Instance
export { SubAgentInstance } from "./instance.js";
// Instruction builders
export {
	ANALYZER_BUILDER,
	bulletList,
	DEFAULT_BUILDER,
	EXECUTOR_BUILDER,
	minimalChanges,
	onlyFlagSecurity,
	PLANNER_BUILDER,
	REVIEWER_BUILDER,
	withSummary,
} from "./instructions/index.js";
export type { InstructionBuilder, InstructionContext } from "./instructions/types.js";
// Session factory
export { createSubAgentSession } from "./session-factory.js";
// Summarizer
export { SubAgentSummarizer } from "./summarizer.js";
export type { TaskExecutionResult, TaskExecutorOptions } from "./task-executor.js"; // Types
export { TaskExecutor } from "./task-executor.js";
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
	SubAgentControllerOptions,
	SubAgentDefinition,
	SubAgentEvent,
	SubAgentEventMap,
	SubAgentEventType,
	SubAgentInstanceState,
	SubAgentRpcState,
	SubAgentState,
	SummarizerOptions,
} from "./types.js";
export type {
	SubAgentWorkspaceHandle,
	SubAgentWorkspaceOptions,
	WorktreeEntry,
} from "./workspace/index.js";
export { SubAgentWorkspace } from "./workspace/index.js";
