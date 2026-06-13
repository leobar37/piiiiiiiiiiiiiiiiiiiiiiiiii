import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SessionLogger } from "@local/pi-logger";
import { SubAgentConfigManager } from "../config-manager.js";
import { SubAgentContextStore } from "../context-store.js";
import type { SubAgentController } from "../controller.js";
import type { DelegationResult, SubAgentEvent, SubAgentRuntimeConfigManager } from "../types.js";
import { createLionCore, type LionCore, type LionSubagentRole } from "./core.js";
import type { LionDashboard } from "./dashboard.js";
import { getOrStartLionDashboard } from "./dashboard.js";
import { LionDelegationGuard } from "./delegation-guard.js";
import { LionRuntimeEventBus } from "./events/bus.js";
import { classifyLionTaskResult } from "./evidence.js";
import {
	type LionSubagentJob,
	type LionSubagentUiState,
	type RetainedLionSubagent,
	SubagentJobManager,
} from "./job-tracker.js";
import { LionLogger } from "./logger.js";
import { MainSessionBridge } from "./main-session.js";
import { type MainLogEntry, RunLogger } from "./run-logger.js";
import { createInitialLionState } from "./state.js";
import { readLionState, writeLionState } from "./state-store.js";
import { getLionStrategy } from "./strategies/index.js";
import { canChangeLionStrategy } from "./strategy-match.js";
import { createLionSubAgentController } from "./subagents/index.js";
import type { LionBuildResult, LionEvent, LionPhase, LionPlan, LionState, LionStrategyName } from "./types.js";
import { LionUI } from "./ui.js";
import { createRunId, normalizeInactiveStrategy } from "./utils.js";

export const LION_ORCHESTRATOR_FEEDBACK_TYPE = "lion-orchestrator-feedback";

export type { LionSubagentJob, LionSubagentUiState, RetainedLionSubagent } from "./job-tracker.js";

export class LionRuntime {
	readonly events: LionRuntimeEventBus;
	readonly ui: LionUI;
	readonly mainSession: MainSessionBridge;
	readonly delegationGuard: LionDelegationGuard;
	readonly #logger: LionLogger;
	readonly #jobTracker: SubagentJobManager;
	#runLogger: RunLogger | null;
	#unsubscribeRunLogger: (() => void) | null;

	#pi: ExtensionAPI;
	#state: LionState;
	#core: LionCore;
	#sessionLogger: SessionLogger | null;
	#controllers: Map<string, SubAgentController>;
	#activeController: SubAgentController | null;
	#activeRunId: string | null;
	#lastUiContext: ExtensionContext | null;
	#widgetTimer: ReturnType<typeof setInterval> | null;
	#configManager: SubAgentRuntimeConfigManager | null;
	#cwd: string;
	#sessionId: string | null;
	dashboard: LionDashboard | null;

	constructor(pi: ExtensionAPI, cwd: string) {
		this.#pi = pi;
		this.#cwd = cwd;
		this.#logger = new LionLogger();
		this.#sessionLogger = null;
		this.#jobTracker = new SubagentJobManager();
		this.ui = new LionUI(pi);
		this.mainSession = new MainSessionBridge(pi);
		this.delegationGuard = new LionDelegationGuard();
		this.#state = createInitialLionState();
		this.#core = createLionCore();
		this.events = new LionRuntimeEventBus();
		this.#controllers = new Map();
		this.#activeController = null;
		this.#activeRunId = null;
		this.#lastUiContext = null;
		this.#widgetTimer = null;
		this.dashboard = null;
		this.#runLogger = null;
		this.#unsubscribeRunLogger = null;
		this.#configManager = null;
		this.#sessionId = null;
	}

	get pi(): ExtensionAPI {
		return this.#pi;
	}
	set pi(value: ExtensionAPI) {
		this.#pi = value;
		this.mainSession.setApi(value);
	}

	get cwd(): string {
		return this.#cwd;
	}
	set cwd(value: string) {
		this.#cwd = value;
	}

	get logger(): SessionLogger | null {
		return this.#sessionLogger;
	}
	set logger(value: SessionLogger | null) {
		this.#sessionLogger = value;
		this.#logger.setLogger(value);
	}

	get runLogger(): RunLogger | null {
		return this.#runLogger;
	}

	initRunLogger(cwd: string, runId: string): RunLogger {
		// Clean up previous run logger if one exists
		if (this.#runLogger) {
			this.#unsubscribeRunLogger?.();
			this.#runLogger.stopHeartbeat();
			if (!this.#runLogger.closed) {
				this.#runLogger.interruptRun(undefined, "new_run_started");
			}
		}
		const runLogger = new RunLogger({ cwd, runId });
		this.#runLogger = runLogger;
		this.#logger.setRunLogger(runLogger);
		// Wire runLogger to also receive lion events
		this.#unsubscribeRunLogger = this.events.on("*", (event) => {
			runLogger.logEvent("lion", "event", event);
		});
		runLogger.startHeartbeat();
		return runLogger;
	}

	completeRun(status: "completed" | "failed" | "cancelled", reason?: string): void {
		this.#runLogger?.completeRun(status, reason);
	}

	interruptRun(signal?: string, reason?: string): void {
		this.#runLogger?.interruptRun(signal, reason);
	}

	get state(): LionState {
		return this.#state;
	}
	set state(value: LionState) {
		this.#state = value;
	}

	get core(): LionCore {
		return this.#core;
	}
	set core(value: LionCore) {
		this.#core = value;
	}

	get controllers(): Map<string, SubAgentController> {
		return this.#controllers;
	}
	get activeController(): SubAgentController | null {
		return this.#activeController;
	}
	set activeController(value: SubAgentController | null) {
		this.#activeController = value;
	}
	get activeRunId(): string | null {
		return this.#activeRunId;
	}
	set activeRunId(value: string | null) {
		this.#activeRunId = value;
	}
	get retainedInstances(): Map<string, RetainedLionSubagent> {
		return this.#jobTracker.retainedInstances;
	}
	get subagentUi(): Map<string, LionSubagentUiState> {
		return this.#jobTracker.subagentUi;
	}
	get subagentJobs(): Map<string, LionSubagentJob> {
		return this.#jobTracker.subagentJobs;
	}

	get lastUiContext(): ExtensionContext | null {
		return this.#lastUiContext;
	}
	set lastUiContext(value: ExtensionContext | null) {
		this.#lastUiContext = value;
	}

	get widgetTimer(): ReturnType<typeof setInterval> | null {
		return this.#widgetTimer;
	}
	set widgetTimer(value: ReturnType<typeof setInterval> | null) {
		this.#widgetTimer = value;
	}

	get configManager(): SubAgentRuntimeConfigManager | null {
		return this.#configManager;
	}
	set configManager(value: SubAgentRuntimeConfigManager | null) {
		this.#configManager = value;
		// Invalidate cached controller so the next ensureController call
		// creates a fresh one with the new config. Also clear the runId
		// mapping so old controllers are not reused.
		this.#activeController = null;
		this.#controllers.clear();
	}

	ensureController(ctx: ExtensionContext): SubAgentController {
		if (this.#activeController) {
			// Cleanup old instances if controller has too many
			const instanceCount = this.#activeController.getInstances().length;
			if (instanceCount > 50) {
				this.cleanupControllerInstances(this.#activeController);
			}
			return this.#activeController;
		}
		const controller = createLionSubAgentController({
			ctx: ctx as ExtensionCommandContext,
			logger: this.#sessionLogger ?? undefined,
			configManager: this.#configManager ?? SubAgentConfigManager.defaultsOnly(),
		});
		this.#activeController = controller;
		return controller;
	}

	private cleanupControllerInstances(controller: SubAgentController): void {
		const instances = controller.getInstances();
		const now = Date.now();
		const maxAgeMs = 30 * 60 * 1000; // 30 minutes
		for (const instance of instances) {
			const state = instance.getState();
			const isDone = state.state === "completed" || state.state === "failed" || state.state === "cancelled";
			const isOld = state.endTime && now - state.endTime > maxAgeMs;
			if (isDone && isOld) {
				// Instance is done and old - dispose it
				instance.dispose().catch(() => {});
			}
		}
	}

	createSubAgentController(ctx: ExtensionContext, runId: string): SubAgentController {
		const controller = this.ensureController(ctx);
		this.#activeRunId = runId;
		this.#controllers.set(runId, controller);
		return controller;
	}

	restore(ctx: ExtensionContext): void {
		this.rememberUiContext(ctx);
		this.#sessionId = ctx.sessionManager.getSessionId();
		const saved = readLionState(this.#cwd, ctx);
		if (saved) {
			this.#state = normalizeInactiveStrategy(saved.state);
			this.#core = saved.core;
		} else {
			this.#state = createInitialLionState();
			this.#core = createLionCore();
		}
		this.#activeRunId = this.#core.activeRun?.runId ?? null;
		this.mainSession.attach(ctx);
		if (this.#state.active) this.ensureController(ctx);
		this.ui.updateStatus(ctx, this.#state);
	}

	attachMainSession(ctx: ExtensionContext): void {
		this.mainSession.attach(ctx);
	}
	recordMainSessionEvent(event: Parameters<MainSessionBridge["record"]>[0], ctx: ExtensionContext): void {
		this.mainSession.record(event, ctx);
	}
	persist(): void {
		writeLionState(this.#cwd, this.#state, this.#core, this.#sessionId);
	}

	queueFeedback(ctx: ExtensionContext, content: string, details: Record<string, unknown>): void {
		const message = { customType: LION_ORCHESTRATOR_FEEDBACK_TYPE, content, display: false, details };
		if (ctx.isIdle() && !ctx.hasPendingMessages()) {
			this.#pi.sendMessage(message, { triggerTurn: true });
			return;
		}
		this.#pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
	}

	emit(event: LionEvent): void {
		this.events.emit(event);
		this.#logger.logEvent(event);
	}
	logState(action: string, details?: Record<string, unknown>): void {
		this.#logger.logState(action, this.#state, this.#core, details);
	}
	logTool(toolName: string, params: unknown, result?: unknown): void {
		this.#logger.logTool(toolName, params, result);
	}
	logError(context: string, error: unknown): void {
		this.#logger.logError(context, error);
	}

	retainSubagent(options: RetainedLionSubagent): void {
		this.#jobTracker.retainSubagent(options);
	}
	releaseRun(runId: string): void {
		this.#jobTracker.releaseRun(runId);
		if (this.#activeRunId === runId) this.#activeRunId = null;
	}

	startJob(options: {
		runId: string;
		taskId: string;
		role: LionSubagentRole;
		title: string;
		timestamp?: number;
	}): LionSubagentJob {
		const job = this.#jobTracker.startJob(options);
		this.logState("start_job", {
			runId: options.runId,
			taskId: options.taskId,
			role: options.role,
			title: options.title,
		});
		this.#runLogger?.logMain({
			type: "state",
			source: "lion",
			data: {
				action: "start_job",
				runId: options.runId,
				taskId: options.taskId,
				role: options.role,
				title: options.title,
			},
		} as Omit<MainLogEntry, "timestamp"> & Record<string, unknown>);
		return job;
	}

	finishJob(taskId: string, result: DelegationResult | null, error?: string): LionSubagentJob | null {
		const job = this.#jobTracker.finishJob(taskId, result, error);
		if (job) {
			this.logState("finish_job", { taskId, status: job.status, error: job.error });
			this.#runLogger?.logMain({
				type: "state",
				source: "lion",
				data: { action: "finish_job", taskId, status: job.status, error: job.error },
			} as Omit<MainLogEntry, "timestamp"> & Record<string, unknown>);
			// Update task counts in run logger
			const jobs = Array.from(this.#jobTracker.subagentJobs.values());
			const completed = jobs.filter((j) => j.status === "completed").length;
			const failed = jobs.filter((j) => j.status === "failed").length;
			const pending = jobs.filter(
				(j) => j.status === "queued" || j.status === "starting" || j.status === "running",
			).length;
			this.#runLogger?.updateTaskCounts(completed, failed, pending, jobs.length);
		}
		return job;
	}

	startSubagentUi(options: {
		runId: string;
		taskId: string;
		role: LionSubagentRole;
		title: string;
		timestamp?: number;
	}): void {
		this.#jobTracker.startSubagentUi(options);
	}
	recordSubagentUiEvent(event: SubAgentEvent): void {
		this.#jobTracker.recordSubagentUiEvent(event);
	}
	getSubagentHealth(taskId?: string): LionSubagentJob[] {
		return this.#jobTracker.getSubagentHealth(taskId);
	}

	// State transitions
	activatePlanning(): void {
		this.#state = {
			...this.#state,
			active: true,
			strategy: "plan",
			phase: "planning",
			activePlanPath: null,
			activePlanSlug: null,
			planKind: null,
			activeTaskId: null,
			lastRunId: null,
		};
		this.logState("activate_planning");
	}
	activateSimple(): void {
		this.#state = {
			...this.#state,
			active: true,
			strategy: "simple",
			phase: "building",
			activePlanPath: null,
			activePlanSlug: null,
			planKind: null,
			activeTaskId: null,
		};
		this.logState("activate_simple");
	}
	activatePlan(plan: LionPlan): void {
		this.#state = {
			...this.#state,
			active: true,
			strategy: "plan",
			phase: "planning",
			activePlanPath: plan.rootPath,
			activePlanSlug: plan.slug,
			planKind: plan.kind,
			activeTaskId: null,
		};
		this.logState("activate_plan", { planSlug: plan.slug, planPath: plan.rootPath, taskCount: plan.tasks.length });
	}
	activateReview(plan: LionPlan): void {
		this.#state = {
			...this.#state,
			active: true,
			strategy: "review",
			phase: "planning",
			activePlanPath: plan.rootPath,
			activePlanSlug: plan.slug,
			planKind: plan.kind,
			activeTaskId: null,
		};
		this.logState("activate_review", {
			reviewSlug: plan.slug,
			reviewPath: plan.rootPath,
			taskCount: plan.tasks.length,
		});
	}
	setPhase(phase: LionPhase): void {
		const previous = this.#state.phase;
		this.#state = { ...this.#state, active: true, phase };
		this.logState("set_phase", { previous, phase });
	}
	setActiveTask(taskId: string | null): void {
		this.#state = { ...this.#state, activeTaskId: taskId };
		this.logState("set_active_task", { taskId });
	}
	setLastRun(runId: string): void {
		this.#state = { ...this.#state, lastRunId: runId };
		this.logState("set_last_run", { runId });
	}
	setStrategy(strategy: LionStrategyName): void {
		if (!canChangeLionStrategy(this.#state, strategy)) {
			throw new Error(
				`Cannot switch Lion strategy from ${this.#state.strategy}/${this.#state.phase} to ${strategy}`,
			);
		}
		if (strategy === this.#state.strategy) return;

		if (strategy === "none") {
			this.#state = createInitialLionState();
		} else if (strategy === "simple") {
			this.#state = {
				...this.#state,
				active: true,
				strategy: "simple",
				phase: "building",
				activePlanPath: null,
				activePlanSlug: null,
				planKind: null,
				activeTaskId: null,
			};
		} else if (strategy === "plan") {
			const keepPlan = this.#state.strategy === "plan" && this.#state.activePlanPath;
			this.#state = {
				...this.#state,
				active: true,
				strategy: "plan",
				phase: "planning",
				activePlanPath: keepPlan ? this.#state.activePlanPath : null,
				activePlanSlug: keepPlan ? this.#state.activePlanSlug : null,
				planKind: keepPlan ? this.#state.planKind : null,
				activeTaskId: null,
			};
		} else {
			throw new Error(`Strategy ${strategy} cannot be activated through setStrategy`);
		}

		this.logState("set_strategy", { strategy });
		this.emit({
			type: "lion.mode.changed",
			timestamp: Date.now(),
			runId: this.#activeRunId ?? createRunId(),
			strategy: this.#state.strategy,
			phase: this.#state.phase,
		});
	}
	applyBuildResult(result: LionBuildResult): void {
		this.#state = { ...this.#state, phase: "planning", activeTaskId: null, lastBuild: result };
		this.mainSession.notifyRunComplete(result);
		this.logState("apply_build_result", { result });
	}
	rememberUiContext(ctx: ExtensionContext): void {
		if (ctx.hasUI) this.#lastUiContext = ctx;
	}

	async startDashboard(): Promise<URL> {
		const dashboard = getOrStartLionDashboard(this);
		this.dashboard = dashboard;
		return dashboard.start();
	}
	async stopDashboard(): Promise<void> {
		if (!this.dashboard) return;
		await this.dashboard.stop();
		this.dashboard = null;
	}
	cleanupSubagentUi(now = Date.now(), retentionMs = 10000): void {
		this.#jobTracker.cleanupSubagentUi(now, retentionMs);
	}

	async buildCompactionInstructions(ctx: ExtensionContext): Promise<string | null> {
		if (!this.#state.active) return null;
		const contextStore = new SubAgentContextStore(ctx.cwd ?? ctx.sessionManager.getCwd());
		return getLionStrategy(this.#state.strategy).buildCompactionInstructions(this.#state, {
			ctx,
			activeRun: this.#core.activeRun,
			recentJobs: this.getRecentJobs(6),
			getSubagentContext: async (taskId) => {
				const sessionId = this.findRetainedSessionId(taskId);
				const contextPath = sessionId ? contextStore.getPath(sessionId, taskId) : "unknown";
				const contextSummary = sessionId
					? await contextStore.formatForPrompt(sessionId, taskId, 5)
					: "No context path is available for this retained subagent.";
				return { path: contextPath, summary: contextSummary };
			},
		});
	}

	getRecentJobs(limit: number): Array<{
		role: string;
		taskId: string;
		status: string;
		summary: string;
		structuredResult: boolean;
		verificationStatus: string;
	}> {
		return Array.from(this.#jobTracker.subagentJobs.values())
			.filter((job) => {
				// In plan mode with active run, filter to current run
				if (this.#state.strategy === "plan" && this.#activeRunId) {
					return job.runId === this.#activeRunId;
				}
				// Fallback: include all recent jobs when no active run or in simple mode
				return true;
			})
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, limit)
			.map((job) => ({
				role: job.role,
				taskId: job.taskId,
				status: job.status,
				summary: job.result?.summary ?? job.error ?? "No summary available",
				structuredResult: job.result?.structuredResult ?? false,
				verificationStatus: job.result ? classifyLionTaskResult(job.result).verificationStatus : "unverified",
			}));
	}

	private findRetainedSessionId(taskId: string): string | undefined {
		return this.#jobTracker.subagentJobs.get(taskId)?.result?.finalState.sessionId;
	}
}
