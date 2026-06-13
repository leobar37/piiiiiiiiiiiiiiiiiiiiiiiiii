import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ImageContent, Model } from "@earendil-works/pi-ai";
import type {
	AuthStorage,
	CompactionResult,
	ModelCycleResult,
	ModelRegistry,
	SessionStats,
	SettingsManager,
	ToolInfo,
} from "@earendil-works/pi-coding-agent";
import type { SessionLogger } from "@local/pi-logger";
import type { DashboardCommand } from "./api/session-control.js";
import { SubAgentConfigManager } from "./config-manager.js";
import { resolveEffectiveConfig } from "./config-resolver.js";
import { SubAgentContextStore as FileSubAgentContextStore } from "./context-store.js";
import { SubAgentEventBus } from "./event-bus.js";
import { SubAgentInstance } from "./instance.js";
import { SubAgentRunStore as FileSubAgentRunStore } from "./run-store.js";
import { TaskExecutor } from "./task-executor.js";
import { TransportManager } from "./transport/manager.js";

import type {
	BashResult,
	ConversationSummary,
	DelegationResult,
	DelegationTask,
	ExecutionPlan,
	QueryRequest,
	QueryResponse,
	SubAgentArtifactStore,
	SubAgentContextStore,
	SubAgentControllerOptions,
	SubAgentDefinition,
	SubAgentInstanceState,
	SubAgentRpcState,
	SubAgentRunStore,
	SubAgentRuntimeConfigManager,
	SummarizerOptions,
} from "./types.js";

export class SubAgentController {
	private definitions: Map<string, SubAgentDefinition>;
	private instances: Map<string, SubAgentInstance> = new Map();
	private cwd: string;
	private artifactStore: SubAgentArtifactStore | undefined;
	private eventBus: SubAgentEventBus;
	private authStorage?: AuthStorage;
	private modelRegistry?: ModelRegistry;
	private settingsManager?: SettingsManager;
	private transportManager?: TransportManager;
	private logger?: SessionLogger;
	private configManager: SubAgentRuntimeConfigManager;
	private contextStore: SubAgentContextStore;
	private runStore: SubAgentRunStore;

	constructor(options: SubAgentControllerOptions) {
		this.cwd = options.cwd;
		this.artifactStore = options.artifactStore;
		this.authStorage = options.authStorage;
		this.modelRegistry = options.modelRegistry;
		this.settingsManager = options.settingsManager;
		this.logger = options.logger;
		this.configManager = options.configManager ?? SubAgentConfigManager.defaultsOnly();
		this.contextStore = options.contextStore ?? new FileSubAgentContextStore(options.cwd);
		this.runStore = options.runStore ?? new FileSubAgentRunStore(options.cwd);
		this.eventBus = new SubAgentEventBus();
		this.definitions = new Map();

		for (const def of options.definitions) {
			this.definitions.set(def.name, def);
		}

		if (options.onEvent) {
			this.eventBus.on("*", options.onEvent);
		}
		if (options.onLifecycleChange) {
			this.eventBus.on("lifecycle.change", options.onLifecycleChange);
		}

		if (this.artifactStore) {
			this.eventBus.on("task.end", async (event) => {
				try {
					await this.artifactStore!.saveResult(event.taskId, event.result);
				} catch {
					/* best effort */
				}
			});
		}

		if (options.transports && options.transports.length > 0) {
			this.transportManager = new TransportManager(this.eventBus);
			for (const transport of options.transports) {
				this.transportManager.addTransport(transport);
			}
			this.transportManager.start();
		}
	}

	// =====================================================================
	// Definitions
	// =====================================================================

	registerDefinition(def: SubAgentDefinition): void {
		if (this.definitions.has(def.name)) {
			throw new Error(`Sub-agent definition "${def.name}" already registered`);
		}
		this.definitions.set(def.name, { ...def });
	}

	unregisterDefinition(name: string): void {
		if (!this.definitions.has(name)) {
			throw new Error(`Sub-agent definition "${name}" not found`);
		}
		this.definitions.delete(name);
	}

	getDefinition(name: string): SubAgentDefinition | undefined {
		return this.definitions.get(name);
	}

	getDefinitions(): SubAgentDefinition[] {
		return Array.from(this.definitions.values());
	}

	getCwd(): string {
		return this.cwd;
	}

	getAuthStorage(): AuthStorage | undefined {
		return this.authStorage;
	}

	getModelRegistry(): ModelRegistry | undefined {
		return this.modelRegistry;
	}

	getSettingsManager(): SettingsManager | undefined {
		return this.settingsManager;
	}

	// =====================================================================
	// Instance Lifecycle
	// =====================================================================

	createInstance(task: DelegationTask): SubAgentInstance {
		const definition = this.definitions.get(task.definition);
		if (!definition) {
			throw new Error(`Sub-agent definition "${task.definition}" not found`);
		}

		// Merge definition + task overrides into effective config
		const config = resolveEffectiveConfig(definition, task, {
			agentConfig: this.configManager.getAgentConfig(definition.name),
		});

		const instanceId = `subagent-${task.id}-${Math.random().toString(36).slice(2, 8)}`;
		const instance = new SubAgentInstance({
			instanceId,
			config,
			definition,
			task,
			cwd: this.cwd,
			resourceCwd: this.cwd,
			eventBus: this.eventBus,
			authStorage: this.authStorage,
			modelRegistry: this.modelRegistry,
			settingsManager: this.settingsManager,
			logger: this.logger,
			configManager: this.configManager,
			contextStore: this.contextStore,
			runStore: this.runStore,
		});

		this.instances.set(task.id, instance);
		return instance;
	}

	async executeTask(task: DelegationTask): Promise<DelegationResult> {
		const instance = this.createInstance(task);
		return instance.start();
	}

	async executePlan(plan: ExecutionPlan): Promise<DelegationResult[]> {
		for (const task of plan.tasks) {
			if (!this.definitions.has(task.definition)) {
				throw new Error(`Sub-agent definition "${task.definition}" not found`);
			}
		}

		const executor = new TaskExecutor({ controller: this });

		const result = await executor.execute(plan);
		return result.results;
	}

	// =====================================================================
	// Instance Access
	// =====================================================================

	getInstance(taskId: string): SubAgentInstance | undefined {
		return this.instances.get(taskId);
	}

	removeInstance(taskId: string): boolean {
		return this.instances.delete(taskId);
	}

	getInstanceById(instanceId: string): SubAgentInstance | undefined {
		for (const instance of this.instances.values()) {
			if (instance.instanceId === instanceId) {
				return instance;
			}
		}
		return undefined;
	}

	getInstances(): SubAgentInstance[] {
		return Array.from(this.instances.values());
	}

	getInstanceStates(): SubAgentInstanceState[] {
		return Array.from(this.instances.values()).map((i) => i.getState());
	}

	// =====================================================================
	// Instance Control
	// =====================================================================

	async pauseInstance(taskId: string): Promise<void> {
		const instance = this.getInstance(taskId);
		if (!instance) throw new Error(`Instance "${taskId}" not found`);
		return instance.pause();
	}

	async resumeInstance(taskId: string): Promise<void> {
		const instance = this.getInstance(taskId);
		if (!instance) throw new Error(`Instance "${taskId}" not found`);
		return instance.resume();
	}

	async cancelInstance(taskId: string): Promise<void> {
		const instance = this.getInstance(taskId);
		if (!instance) throw new Error(`Instance "${taskId}" not found`);
		return instance.cancel();
	}

	async queryInstance(taskId: string, request: QueryRequest): Promise<QueryResponse> {
		const instance = this.getInstance(taskId);
		if (!instance) {
			return {
				queryId: request.queryId,
				question: request.question,
				answer: "",
				duration: 0,
				failed: true,
			};
		}
		return instance.query(request);
	}

	async summarizeInstance(taskId: string, options?: SummarizerOptions): Promise<ConversationSummary | null> {
		const instance = this.getInstance(taskId);
		if (!instance) return null;
		return instance.summarize(options);
	}

	// =====================================================================
	// RPC Proxy Methods
	// =====================================================================

	async promptInstance(
		taskId: string,
		message: string,
		options?: { images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" },
	): Promise<void> {
		return this.requireInstance(taskId).prompt(message, options);
	}

	async steerInstance(taskId: string, message: string, images?: ImageContent[]): Promise<void> {
		return this.requireInstance(taskId).steer(message, images);
	}

	async abortInstance(taskId: string): Promise<void> {
		return this.requireInstance(taskId).abort();
	}

	getInstanceState(taskId: string): SubAgentRpcState {
		return this.requireInstance(taskId).getRpcState();
	}

	async setInstanceModel(taskId: string, model: Model<any>): Promise<void> {
		return this.requireInstance(taskId).setModel(model);
	}

	async cycleInstanceModel(taskId: string): Promise<ModelCycleResult | null> {
		return this.requireInstance(taskId).cycleModel();
	}

	getInstanceMessages(taskId: string): AgentMessage[] {
		return this.requireInstance(taskId).getMessages();
	}

	async instanceBash(taskId: string, command: string): Promise<BashResult> {
		return this.requireInstance(taskId).bash(command);
	}

	async compactInstance(taskId: string, customInstructions?: string): Promise<CompactionResult> {
		return this.requireInstance(taskId).compact(customInstructions);
	}

	async instanceFollowUp(taskId: string, message: string, images?: ImageContent[]): Promise<void> {
		return this.requireInstance(taskId).followUp(message, images);
	}

	instanceSetSteeringMode(taskId: string, mode: "all" | "one-at-a-time"): void {
		this.requireInstance(taskId).setSteeringMode(mode);
	}

	instanceSetFollowUpMode(taskId: string, mode: "all" | "one-at-a-time"): void {
		this.requireInstance(taskId).setFollowUpMode(mode);
	}

	instanceSetThinkingLevel(taskId: string, level: ThinkingLevel): void {
		this.requireInstance(taskId).setThinkingLevel(level);
	}

	instanceCycleThinkingLevel(taskId: string): ThinkingLevel | null {
		return this.requireInstance(taskId).cycleThinkingLevel();
	}

	async getInstanceAvailableModels(taskId: string): Promise<Model<any>[]> {
		return this.requireInstance(taskId).getAvailableModels();
	}

	instanceSetAutoCompaction(taskId: string, enabled: boolean): void {
		this.requireInstance(taskId).setAutoCompaction(enabled);
	}

	instanceSetAutoRetry(taskId: string, enabled: boolean): void {
		this.requireInstance(taskId).setAutoRetry(enabled);
	}

	instanceAbortRetry(taskId: string): void {
		this.requireInstance(taskId).abortRetry();
	}

	instanceAbortBash(taskId: string): void {
		this.requireInstance(taskId).abortBash();
	}

	instanceGetSessionStats(taskId: string): SessionStats {
		return this.requireInstance(taskId).getSessionStats();
	}

	async instanceExportHtml(taskId: string, outputPath?: string): Promise<string> {
		return this.requireInstance(taskId).exportHtml(outputPath);
	}

	instanceGetLastAssistantText(taskId: string): string | null {
		return this.requireInstance(taskId).getLastAssistantText();
	}

	instanceSetSessionName(taskId: string, name: string): void {
		this.requireInstance(taskId).setSessionName(name);
	}

	instanceGetSessionName(taskId: string): string | undefined {
		return this.requireInstance(taskId).getSessionName();
	}

	instanceGetPendingMessageCount(taskId: string): number {
		return this.requireInstance(taskId).getPendingMessageCount();
	}

	instanceClearQueue(taskId: string): { steering: string[]; followUp: string[] } {
		return this.requireInstance(taskId).clearQueue();
	}

	instanceGetActiveToolNames(taskId: string): string[] {
		return this.requireInstance(taskId).getActiveToolNames();
	}

	instanceGetAllTools(taskId: string): ToolInfo[] {
		return this.requireInstance(taskId).getAllTools();
	}

	instanceSetActiveTools(taskId: string, toolNames: string[]): void {
		this.requireInstance(taskId).setActiveTools(toolNames);
	}

	instanceGetCommands(taskId: string): DashboardCommand[] {
		return this.requireInstance(taskId).getCommands();
	}

	// =====================================================================
	// Helpers
	// =====================================================================

	private requireInstance(taskId: string): SubAgentInstance {
		const instance = this.instances.get(taskId);
		if (!instance) throw new Error(`Instance "${taskId}" not found`);
		return instance;
	}

	// =====================================================================
	// Events
	// =====================================================================

	getEventBus(): SubAgentEventBus {
		return this.eventBus;
	}

	// =====================================================================
	// Cleanup
	// =====================================================================

	async dispose(): Promise<void> {
		await this.transportManager?.stop();
		for (const instance of this.instances.values()) {
			try {
				await instance.dispose();
			} catch {
				/* best effort */
			}
		}
		this.instances.clear();
		this.eventBus.clear();
	}
}
