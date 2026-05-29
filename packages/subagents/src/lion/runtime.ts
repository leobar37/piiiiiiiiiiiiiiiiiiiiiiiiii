import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SessionLogger } from "@local/pi-logger";
import { SubAgentContextStore } from "../context-store.js";
import type { SubAgentController } from "../controller.js";
import type { DelegationResult, SubAgentEvent } from "../types.js";
import { createLionCore, type LionCore, type LionSubagentRole, restoreLionCore } from "./core.js";
import type { LionDashboard } from "./dashboard.js";
import { getOrStartLionDashboard } from "./dashboard.js";
import { LionDelegationGuard } from "./delegation-guard.js";
import { LionRuntimeEventBus } from "./events/bus.js";
import {
	type LionSubagentJob,
	type LionSubagentUiState,
	type RetainedLionSubagent,
	SubagentJobManager,
} from "./job-tracker.js";
import { LionLogger } from "./logger.js";
import { MainSessionBridge } from "./main-session.js";
import { LionPersistence } from "./persistence.js";
import { createInitialLionState } from "./state.js";
import { createLionSubAgentController } from "./subagents/index.js";
import type { LionBuildResult, LionEvent, LionMode, LionPlan, LionState, PersistedLionState } from "./types.js";
import { LionUI } from "./ui.js";

export const LION_ORCHESTRATOR_FEEDBACK_TYPE = "lion-orchestrator-feedback";

export type { LionSubagentJob, LionSubagentUiState, RetainedLionSubagent } from "./job-tracker.js";
export { LionPersistence } from "./persistence.js";

export class LionRuntime {
	readonly persistence: LionPersistence;
	readonly events: LionRuntimeEventBus;
	readonly ui: LionUI;
	readonly mainSession: MainSessionBridge;
	readonly delegationGuard: LionDelegationGuard;
	readonly #logger: LionLogger;
	readonly #jobTracker: SubagentJobManager;

	#pi: ExtensionAPI;
	#state: LionState;
	#core: LionCore;
	#sessionLogger: SessionLogger | null;
	#controllers: Map<string, SubAgentController>;
	#activeController: SubAgentController | null;
	#activeRunId: string | null;
	#lastUiContext: ExtensionContext | null;
	#widgetTimer: ReturnType<typeof setInterval> | null;
	dashboard: LionDashboard | null;

	constructor(pi: ExtensionAPI) {
		this.#pi = pi;
		this.persistence = new LionPersistence(pi);
		this.#logger = new LionLogger();
		this.#sessionLogger = null;
		this.#jobTracker = new SubagentJobManager();
		this.ui = new LionUI(pi);
		this.mainSession = new MainSessionBridge();
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
	}

	get pi(): ExtensionAPI {
		return this.#pi;
	}
	set pi(value: ExtensionAPI) {
		this.#pi = value;
	}

	get logger(): SessionLogger | null {
		return this.#sessionLogger;
	}
	set logger(value: SessionLogger | null) {
		this.#sessionLogger = value;
		this.#logger.setLogger(value);
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

	ensureController(ctx: ExtensionContext): SubAgentController {
		if (this.#activeController) return this.#activeController;
		const controller = createLionSubAgentController({
			ctx: ctx as ExtensionCommandContext,
			logger: this.#sessionLogger ?? undefined,
		});
		this.#activeController = controller;
		return controller;
	}

	createSubAgentController(ctx: ExtensionContext, runId: string): SubAgentController {
		const controller = this.ensureController(ctx);
		this.#activeRunId = runId;
		this.#controllers.set(runId, controller);
		return controller;
	}

	restore(ctx: ExtensionContext): void {
		this.#state = this.persistence.restoreState(ctx);
		this.#core = restoreLionCore(ctx);
		this.#activeRunId = this.#core.activeRun?.runId ?? null;
		if (this.#state.active) {
			this.ensureController(ctx);
			this.mainSession.attach(ctx);
		}
		this.ui.updateStatus(ctx, this.#state);
	}

	attachMainSession(ctx: ExtensionContext): void {
		if (this.#state.active) this.mainSession.attach(ctx);
	}
	recordMainSessionEvent(event: Parameters<MainSessionBridge["record"]>[0], ctx: ExtensionContext): void {
		if (this.#state.active) this.mainSession.record(event, ctx);
	}
	persist(action: PersistedLionState["action"]): void {
		this.persistence.saveState(this.#state, action);
	}
	saveCore(action: "start" | "record" | "finish" | "restore"): void {
		this.persistence.saveCore(this.#core, action);
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
		return job;
	}

	finishJob(taskId: string, result: DelegationResult | null, error?: string): LionSubagentJob | null {
		const job = this.#jobTracker.finishJob(taskId, result, error);
		if (job) this.logState("finish_job", { taskId, status: job.status, error: job.error });
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
		this.#state = { ...this.#state, active: true, mode: "planning" };
		this.logState("activate_planning");
	}
	activatePlan(plan: LionPlan): void {
		this.#state = {
			...this.#state,
			active: true,
			mode: "planning",
			activePlanPath: plan.rootPath,
			activePlanSlug: plan.slug,
			planKind: plan.kind,
			activeTaskId: null,
		};
		this.logState("activate_plan", { planSlug: plan.slug, planPath: plan.rootPath, taskCount: plan.tasks.length });
	}
	setMode(mode: LionMode): void {
		const previous = this.#state.mode;
		this.#state = { ...this.#state, active: true, mode };
		this.logState("set_mode", { previous, mode });
	}
	setActiveTask(taskId: string | null): void {
		this.#state = { ...this.#state, activeTaskId: taskId };
		this.logState("set_active_task", { taskId });
	}
	setLastRun(runId: string): void {
		this.#state = { ...this.#state, lastRunId: runId };
		this.logState("set_last_run", { runId });
	}
	applyBuildResult(result: LionBuildResult): void {
		this.#state = { ...this.#state, mode: "planning", activeTaskId: null, lastBuild: result };
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
		const parts = [
			"Lion orchestration is active. Preserve the Lion state, active plan, active task, run status, subagent summaries, blockers, and next orchestration step in the compaction summary.",
			`Mode: ${this.#state.mode}`,
			`Active plan: ${this.#state.activePlanSlug ?? "none"}`,
			`Active plan path: ${this.#state.activePlanPath ?? "none"}`,
			`Active task: ${this.#state.activeTaskId ?? "none"}`,
		];

		const activeRun = this.#core.activeRun;
		if (activeRun) {
			parts.push(
				[
					"Active run:",
					`- runId: ${activeRun.runId}`,
					`- taskId: ${activeRun.taskId}`,
					`- taskTitle: ${activeRun.taskTitle}`,
					`- status: ${activeRun.status}`,
					`- attempts: ${activeRun.attempts}/${activeRun.maxAttempts}`,
					`- verdict: ${activeRun.verdict ?? "none"}`,
					`- error: ${activeRun.error ?? "none"}`,
				].join("\n"),
			);

			const contextStore = new SubAgentContextStore(ctx.cwd ?? ctx.sessionManager.getCwd());
			for (const subagent of activeRun.subagents.slice(-6)) {
				const sessionId = this.findRetainedSessionId(subagent.taskId);
				const contextPath = sessionId ? contextStore.getPath(sessionId, subagent.taskId) : "unknown";
				const contextSummary = sessionId
					? await contextStore.formatForPrompt(sessionId, subagent.taskId, 5)
					: "No context path is available for this retained subagent.";
				parts.push(
					[
						`Subagent ${subagent.role}:`,
						`- taskId: ${subagent.taskId}`,
						`- status: ${subagent.status}`,
						`- contextPath: ${contextPath}`,
						`- summary: ${subagent.summary}`,
						`- durableContext:`,
						contextSummary,
					].join("\n"),
				);
			}
		}

		return parts.join("\n\n");
	}

	private findRetainedSessionId(taskId: string): string | undefined {
		return this.#jobTracker.subagentJobs.get(taskId)?.result?.finalState.sessionId;
	}
}
