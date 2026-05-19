import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ImageContent, Model } from "@earendil-works/pi-ai";
import type {
	AgentSessionEventListener,
	AuthStorage,
	CompactionResult,
	ModelCycleResult,
	ModelRegistry,
	SessionStats,
	SettingsManager,
	ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { readResultArtifact, writeEventLog, writeResultArtifact } from "./artifacts/index.js";
import type { SubAgentEventBus } from "./event-bus.js";
import { createSubAgentSession } from "./session-factory.js";
import { SubAgentSummarizer } from "./summarizer.js";
import type {
	BashResult,
	ConversationSummary,
	CreateSubAgentInstanceOptions,
	DelegationResult,
	QueryRequest,
	QueryResponse,
	SubAgentEvent,
	SubAgentInstanceState,
	SubAgentRpcState,
	SubAgentState,
	SummarizerOptions,
} from "./types.js";

export class SubAgentInstance {
	readonly instanceId: string;
	readonly taskId: string;
	readonly definitionName: string;
	readonly taskDescription: string;

	private state: SubAgentState = "created";
	private session: import("@earendil-works/pi-coding-agent").AgentSession | null = null;
	private turnCount = 0;
	private startTime: number | null = null;
	private endTime: number | null = null;
	private currentTool: string | null = null;
	private error: string | null = null;
	private eventBus: SubAgentEventBus;
	private config: import("./types.js").EffectiveSubAgentConfig;
	private definition: import("./types.js").SubAgentDefinition;
	private task: import("./types.js").DelegationTask;
	private cwd: string;
	private artifactsDir: string;
	private cleanupFn: (() => Promise<void>) | null = null;
	private completionResolve: ((result: DelegationResult) => void) | null = null;
	private queryResolvers = new Map<
		string,
		{
			resolve: (response: QueryResponse) => void;
			reject: (err: Error) => void;
			timer?: ReturnType<typeof setTimeout>;
		}
	>();
	private eventLog: SubAgentEvent[] = [];
	private unsubscribeSession?: () => void;
	private authStorage?: AuthStorage;
	private modelRegistry?: ModelRegistry;
	private settingsManager?: SettingsManager;

	constructor(options: CreateSubAgentInstanceOptions) {
		this.instanceId = options.instanceId;
		this.taskId = options.task.id;
		this.definitionName = options.definition.name;
		this.taskDescription = options.config.description;
		this.config = options.config;
		this.definition = options.definition;
		this.task = options.task;
		this.cwd = options.cwd;
		this.artifactsDir = options.artifactsDir;
		this.eventBus = options.eventBus;
		this.authStorage = options.authStorage;
		this.modelRegistry = options.modelRegistry;
		this.settingsManager = options.settingsManager;
	}

	// =====================================================================
	// State
	// =====================================================================

	getState(): SubAgentInstanceState {
		return {
			instanceId: this.instanceId,
			taskId: this.taskId,
			definitionName: this.definitionName,
			state: this.state,
			startTime: this.startTime,
			endTime: this.endTime,
			turnCount: this.turnCount,
			lastActivityAt: Date.now(),
			currentTool: this.currentTool,
			error: this.error,
		};
	}

	private transition(to: SubAgentState): void {
		const from = this.state;
		if (from === to) return;
		this.state = to;
		const event: SubAgentEvent = {
			type: "lifecycle.change",
			instanceId: this.instanceId,
			previous: from,
			current: to,
			timestamp: Date.now(),
		};
		this.logEvent(event);
		this.eventBus.emit(event);
	}

	private assertSessionReady(): import("@earendil-works/pi-coding-agent").AgentSession {
		if (!this.session) {
			throw new Error(`SubAgentInstance "${this.instanceId}" is not running. Current state: ${this.state}`);
		}
		return this.session;
	}

	// =====================================================================
	// Lifecycle
	// =====================================================================

	async start(): Promise<DelegationResult> {
		if (this.state !== "created") {
			throw new Error(`Cannot start instance "${this.instanceId}" from state "${this.state}". Expected "created".`);
		}

		this.startTime = Date.now();
		this.transition("starting");

		return new Promise<DelegationResult>((resolve, reject) => {
			this.completionResolve = resolve;

			this.runAgentLoop().catch((err) => {
				const errorMessage = err instanceof Error ? err.message : String(err);
				this.error = errorMessage;
				this.transition("failed");
				this.endTime = Date.now();
				const result = this.buildResult("failed", errorMessage);
				this.logEvent({
					type: "task.end",
					instanceId: this.instanceId,
					taskId: this.taskId,
					result,
					timestamp: Date.now(),
				});
				this.eventBus.emit({
					type: "task.end",
					instanceId: this.instanceId,
					taskId: this.taskId,
					result,
					timestamp: Date.now(),
				});
				reject(new Error(errorMessage));
			});
		});
	}

	private async runAgentLoop(): Promise<void> {
		const { session, cleanup } = await createSubAgentSession({
			config: this.config,
			task: this.task,
			cwd: this.cwd,
			artifactsDir: this.artifactsDir,
			eventBus: this.eventBus,
			instanceId: this.instanceId,
			authStorage: this.authStorage,
			modelRegistry: this.modelRegistry,
			settingsManager: this.settingsManager,
		});

		this.session = session;
		this.cleanupFn = cleanup;

		this.unsubscribeSession = session.subscribe(this.handleSessionEvent.bind(this));
		await session.sendUserMessage(this.task.prompt);
	}

	private handleSessionEvent: AgentSessionEventListener = (event) => {
		const now = Date.now();

		switch (event.type) {
			case "agent_start": {
				this.transition("running");
				const startEvent: SubAgentEvent = {
					type: "task.start",
					instanceId: this.instanceId,
					taskId: this.taskId,
					definitionName: this.definitionName,
					description: this.taskDescription,
					timestamp: now,
				};
				this.logEvent(startEvent);
				this.eventBus.emit(startEvent);
				break;
			}

			case "agent_end": {
				this.transition("completing");
				this.handleCompletion();
				break;
			}

			case "turn_end": {
				this.turnCount++;
				const hadError = event.toolResults.some((tr) => tr.isError);
				const turnEvent: SubAgentEvent = {
					type: "turn.complete",
					instanceId: this.instanceId,
					taskId: this.taskId,
					turnIndex: this.turnCount - 1,
					toolCount: event.toolResults.length,
					hadError,
					timestamp: now,
				};
				this.logEvent(turnEvent);
				this.eventBus.emit(turnEvent);
				break;
			}

			case "tool_execution_start": {
				this.currentTool = event.toolName;
				if (this.config.verboseTools) {
					const toolEvent: SubAgentEvent = {
						type: "tool.execute",
						instanceId: this.instanceId,
						taskId: this.taskId,
						toolName: event.toolName,
						toolCallId: event.toolCallId,
						isError: false,
						timestamp: now,
					};
					this.logEvent(toolEvent);
					this.eventBus.emit(toolEvent);
				}
				break;
			}

			case "tool_execution_end": {
				this.currentTool = null;
				if (this.config.verboseTools) {
					const toolEvent: SubAgentEvent = {
						type: "tool.execute",
						instanceId: this.instanceId,
						taskId: this.taskId,
						toolName: event.toolName,
						toolCallId: event.toolCallId,
						isError: event.isError,
						timestamp: now,
					};
					this.logEvent(toolEvent);
					this.eventBus.emit(toolEvent);
				}
				break;
			}

			case "message_end": {
				if (event.message.role === "assistant") {
					const text = this.extractAssistantText(event.message);
					const preview = text?.slice(0, 200) ?? "";
					const progressEvent: SubAgentEvent = {
						type: "progress.update",
						instanceId: this.instanceId,
						taskId: this.taskId,
						message: preview,
						timestamp: now,
					};
					this.logEvent(progressEvent);
					this.eventBus.emit(progressEvent);
				}
				break;
			}
		}
	};

	private extractAssistantText(message: AgentMessage): string | null {
		if (message.role !== "assistant") return null;
		const content = (message as { content?: unknown }).content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			return content
				.filter((c) => typeof c === "object" && c !== null && "type" in c && c.type === "text")
				.map((c) => (c as { text?: string }).text ?? "")
				.join("");
		}
		return null;
	}

	private handleCompletion(): void {
		this.endTime = Date.now();
		const resultContent = readResultArtifact(this.artifactsDir, this.taskId);
		const summary = resultContent ?? "No result artifact found";
		const result = this.buildResult("completed", summary);

		try {
			writeResultArtifact(this.artifactsDir, this.taskId, {
				status: result.status,
				summary: result.summary,
				outputPath: result.outputPath,
				turnCount: result.turnCount,
				duration: result.duration,
			});
		} catch {
			/* best effort */
		}

		try {
			writeEventLog(this.artifactsDir, this.taskId, this.eventLog);
		} catch {
			/* best effort */
		}

		this.transition("completed");
		const endEvent: SubAgentEvent = {
			type: "task.end",
			instanceId: this.instanceId,
			taskId: this.taskId,
			result,
			timestamp: Date.now(),
		};
		this.logEvent(endEvent);
		this.eventBus.emit(endEvent);
		this.completionResolve?.(result);
	}

	private buildResult(status: DelegationResult["status"], summary: string): DelegationResult {
		return {
			taskId: this.taskId,
			agent: this.definitionName,
			status,
			outputPath: this.task.outputArtifact,
			summary,
			duration: this.endTime && this.startTime ? this.endTime - this.startTime : 0,
			turnCount: this.turnCount,
			finalState: this.getState(),
		};
	}

	private logEvent(event: SubAgentEvent): void {
		this.eventLog.push(event);
	}

	// =====================================================================
	// Query (Interrogation)
	// =====================================================================

	async query(request: QueryRequest): Promise<QueryResponse> {
		if (this.state !== "running") {
			return {
				queryId: request.queryId,
				question: request.question,
				answer: "",
				duration: 0,
				failed: true,
			};
		}

		const session = this.assertSessionReady();
		const timeoutMs = request.timeoutMs ?? 30000;
		const start = Date.now();

		return new Promise<QueryResponse>((resolve, reject) => {
			const resolver: {
				resolve: (response: QueryResponse) => void;
				reject: (err: Error) => void;
				timer?: ReturnType<typeof setTimeout>;
			} = {
				resolve: (response: QueryResponse) => {
					clearTimeout(timer);
					this.queryResolvers.delete(request.queryId);
					this.emitQueryResponse(request.queryId, request.question, response.answer, Date.now() - start, false);
					resolve(response);
				},
				reject: (err: Error) => {
					clearTimeout(timer);
					this.queryResolvers.delete(request.queryId);
					reject(err);
				},
			};

			const timer = setTimeout(() => {
				this.queryResolvers.delete(request.queryId);
				const response: QueryResponse = {
					queryId: request.queryId,
					question: request.question,
					answer: "",
					duration: Date.now() - start,
					failed: true,
				};
				this.emitQueryResponse(request.queryId, request.question, "", response.duration, true);
				resolve(response);
			}, timeoutMs);

			resolver.timer = timer;

			this.queryResolvers.set(request.queryId, resolver);

			const formatted = `[ORCHESTRATOR QUERY] ${request.question}\n\nAnswer concisely. Do not run tools unless necessary.`;

			session.steer(formatted).catch((err) => {
				resolver.reject(err instanceof Error ? err : new Error(String(err)));
			});

			const unsub = session.subscribe((evt) => {
				if (evt.type === "message_end" && evt.message.role === "assistant") {
					const text = this.extractAssistantText(evt.message) ?? "";
					unsub();
					resolver.resolve({
						queryId: request.queryId,
						question: request.question,
						answer: text,
						duration: Date.now() - start,
						failed: false,
					});
				}
			});
		});
	}

	private emitQueryResponse(
		queryId: string,
		question: string,
		answer: string,
		_duration: number,
		_failed: boolean,
	): void {
		const event: SubAgentEvent = {
			type: "query.response",
			instanceId: this.instanceId,
			taskId: this.taskId,
			queryId,
			question,
			answer,
			timestamp: Date.now(),
		};
		this.logEvent(event);
		this.eventBus.emit(event);
	}

	// =====================================================================
	// Summarize
	// =====================================================================

	summarize(options?: SummarizerOptions): ConversationSummary | null {
		if (!this.session) return null;
		const summarizer = new SubAgentSummarizer();
		const summary = summarizer.summarize(this.session.sessionManager, options);
		const event: SubAgentEvent = {
			type: "summary.available",
			instanceId: this.instanceId,
			taskId: this.taskId,
			summary: summary.text,
			messageCount: summary.messageCount,
			timestamp: Date.now(),
		};
		this.logEvent(event);
		this.eventBus.emit(event);
		return summary;
	}

	// =====================================================================
	// Pause / Resume / Cancel
	// =====================================================================

	async pause(): Promise<void> {
		if (this.state !== "running") return;
		const session = this.assertSessionReady();
		await session.abort();
		this.transition("paused");
	}

	async resume(): Promise<void> {
		if (this.state !== "paused") return;
		const session = this.assertSessionReady();
		await session.sendUserMessage("Continue.");
		this.transition("running");
	}

	async cancel(): Promise<void> {
		if (this.state === "completed" || this.state === "failed" || this.state === "cancelled") return;
		const session = this.assertSessionReady();
		await session.abort();
		this.transition("cancelled");
		this.endTime = Date.now();
		const result = this.buildResult("cancelled", "Cancelled by orchestrator");
		const endEvent: SubAgentEvent = {
			type: "task.end",
			instanceId: this.instanceId,
			taskId: this.taskId,
			result,
			timestamp: Date.now(),
		};
		this.logEvent(endEvent);
		this.eventBus.emit(endEvent);
		this.completionResolve?.(result);
	}

	// =====================================================================
	// Dispose
	// =====================================================================

	async dispose(): Promise<void> {
		this.unsubscribeSession?.();
		if (this.session) {
			try {
				this.session.dispose();
			} catch {
				/* best effort */
			}
			this.session = null;
		}
		if (this.cleanupFn) {
			try {
				await this.cleanupFn();
			} catch {
				/* best effort */
			}
			this.cleanupFn = null;
		}
		for (const [, resolver] of this.queryResolvers) {
			clearTimeout(resolver.timer);
			resolver.reject(new Error("Instance disposed"));
		}
		this.queryResolvers.clear();
	}

	// =====================================================================
	// RPC Adapter API (direct delegation to AgentSession)
	// =====================================================================

	async prompt(
		message: string,
		options?: { images?: ImageContent[]; streamingBehavior?: "steer" | "followUp" },
	): Promise<void> {
		return this.assertSessionReady().prompt(message, options);
	}

	async steer(message: string, images?: ImageContent[]): Promise<void> {
		return this.assertSessionReady().steer(message, images);
	}

	async followUp(message: string, images?: ImageContent[]): Promise<void> {
		return this.assertSessionReady().followUp(message, images);
	}

	async abort(): Promise<void> {
		return this.assertSessionReady().abort();
	}

	getRpcState(): SubAgentRpcState {
		const session = this.assertSessionReady();
		return {
			model: session.model,
			thinkingLevel: session.thinkingLevel,
			isStreaming: session.isStreaming,
			isCompacting: session.isCompacting,
			steeringMode: session.steeringMode,
			followUpMode: session.followUpMode,
			sessionFile: session.sessionFile,
			sessionId: session.sessionId,
			sessionName: session.sessionName,
			autoCompactionEnabled: session.autoCompactionEnabled,
			messageCount: session.messages.length,
			pendingMessageCount: session.pendingMessageCount,
		};
	}

	async setModel(model: Model<any>): Promise<void> {
		return this.assertSessionReady().setModel(model);
	}

	async cycleModel(): Promise<ModelCycleResult | null> {
		const result = await this.assertSessionReady().cycleModel();
		return result ?? null;
	}

	async getAvailableModels(): Promise<Model<any>[]> {
		return this.assertSessionReady().modelRegistry.getAvailable();
	}

	setThinkingLevel(level: ThinkingLevel): void {
		this.assertSessionReady().setThinkingLevel(level);
	}

	cycleThinkingLevel(): ThinkingLevel | null {
		return this.assertSessionReady().cycleThinkingLevel() ?? null;
	}

	setSteeringMode(mode: "all" | "one-at-a-time"): void {
		this.assertSessionReady().setSteeringMode(mode);
	}

	setFollowUpMode(mode: "all" | "one-at-a-time"): void {
		this.assertSessionReady().setFollowUpMode(mode);
	}

	async compact(customInstructions?: string): Promise<CompactionResult> {
		return this.assertSessionReady().compact(customInstructions);
	}

	setAutoCompaction(enabled: boolean): void {
		this.assertSessionReady().setAutoCompactionEnabled(enabled);
	}

	setAutoRetry(enabled: boolean): void {
		this.assertSessionReady().setAutoRetryEnabled(enabled);
	}

	abortRetry(): void {
		this.assertSessionReady().abortRetry();
	}

	async bash(command: string): Promise<BashResult> {
		return this.assertSessionReady().executeBash(command);
	}

	abortBash(): void {
		this.assertSessionReady().abortBash();
	}

	getSessionStats(): SessionStats {
		return this.assertSessionReady().getSessionStats();
	}

	async exportHtml(outputPath?: string): Promise<string> {
		return this.assertSessionReady().exportToHtml(outputPath);
	}

	getMessages(): AgentMessage[] {
		return this.assertSessionReady().messages;
	}

	getLastAssistantText(): string | null {
		return this.assertSessionReady().getLastAssistantText() ?? null;
	}

	setSessionName(name: string): void {
		this.assertSessionReady().setSessionName(name);
	}

	getSessionName(): string | undefined {
		return this.assertSessionReady().sessionName;
	}

	getCwd(): string {
		return this.cwd;
	}

	getPendingMessageCount(): number {
		return this.assertSessionReady().pendingMessageCount;
	}

	clearQueue(): { steering: string[]; followUp: string[] } {
		return this.assertSessionReady().clearQueue();
	}

	getActiveToolNames(): string[] {
		return this.assertSessionReady().getActiveToolNames();
	}

	getAllTools(): ToolInfo[] {
		return this.assertSessionReady().getAllTools();
	}

	setActiveTools(toolNames: string[]): void {
		this.assertSessionReady().setActiveToolsByName(toolNames);
	}
}
