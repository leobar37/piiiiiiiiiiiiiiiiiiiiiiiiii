import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DelegationResult, SubAgentController, SubAgentEvent } from "@local/pi-subagents";
import {
	buildPersistedLionCore,
	createLionCore,
	LION_CORE_ENTRY_TYPE,
	type LionCore,
	type LionSubagentRole,
	restoreLionCore,
} from "./core.js";
import type { LionDashboard } from "./dashboard.js";
import { LionEventBus } from "./events/bus.js";
import { createInitialLionState } from "./state.js";
import { createLionSubAgentController } from "./subagents/index.js";
import {
	LION_STATE_ENTRY_TYPE,
	type LionBuildResult,
	type LionEvent,
	type LionMode,
	type LionPlan,
	type LionState,
	type PersistedLionState,
} from "./types.js";
import { LionUI } from "./ui.js";

export const LION_ORCHESTRATOR_FEEDBACK_TYPE = "lion-orchestrator-feedback";

export class LionPersistence {
	readonly #pi: ExtensionAPI;

	constructor(pi: ExtensionAPI) {
		this.#pi = pi;
	}

	restoreState(ctx: ExtensionContext): LionState {
		let lastState: PersistedLionState | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== LION_STATE_ENTRY_TYPE) continue;
			lastState = entry.data as PersistedLionState | undefined;
		}
		if (!lastState || lastState.version !== 1) return createInitialLionState();
		const { action: _action, updatedAt: _updatedAt, ...state } = lastState;
		return state;
	}

	saveState(state: LionState, action: PersistedLionState["action"]): void {
		this.#pi.appendEntry(LION_STATE_ENTRY_TYPE, { ...state, action, updatedAt: Date.now() });
	}

	saveCore(core: LionCore, action: "start" | "record" | "finish" | "restore"): void {
		this.#pi.appendEntry(LION_CORE_ENTRY_TYPE, buildPersistedLionCore(core, action));
	}
}

export interface RetainedLionSubagent {
	runId: string;
	role: LionSubagentRole;
	taskId: string;
}

export interface LionSubagentUiState {
	runId: string;
	taskId: string;
	instanceId: string;
	role: LionSubagentRole;
	title: string;
	status: "queued" | "running" | "completed" | "failed";
	turnCount: number;
	toolCount: number;
	currentTool: string | null;
	summary: string | null;
	startedAt: number;
	updatedAt: number;
	completedAt: number | null;
	definition?: string;
}

export interface LionSubagentJob {
	runId: string;
	taskId: string;
	role: LionSubagentRole;
	title: string;
	status: "queued" | "running" | "completed" | "failed";
	startedAt: number;
	updatedAt: number;
	completedAt: number | null;
	result: DelegationResult | null;
	error: string | null;
	lastEvents: SubAgentEvent[];
}

export class LionRuntime {
	readonly persistence: LionPersistence;
	readonly events: LionEventBus;
	readonly ui: LionUI;

	#pi: ExtensionAPI;
	#state: LionState;
	#core: LionCore;
	#controllers: Map<string, SubAgentController>;
	#activeController: SubAgentController | null;
	#activeRunId: string | null;
	#retainedInstances: Map<string, RetainedLionSubagent>;
	#subagentJobs: Map<string, LionSubagentJob>;
	#subagentUi: Map<string, LionSubagentUiState>;
	#lastUiContext: ExtensionContext | null;
	#widgetTimer: ReturnType<typeof setInterval> | null;
	dashboard: LionDashboard | null;

	constructor(pi: ExtensionAPI) {
		this.#pi = pi;
		this.persistence = new LionPersistence(pi);
		this.ui = new LionUI(pi);
		this.#state = createInitialLionState();
		this.#core = createLionCore();
		this.events = new LionEventBus();
		this.#controllers = new Map();
		this.#activeController = null;
		this.#activeRunId = null;
		this.#retainedInstances = new Map();
		this.#subagentJobs = new Map();
		this.#subagentUi = new Map();
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
		return this.#retainedInstances;
	}

	get subagentJobs(): Map<string, LionSubagentJob> {
		return this.#subagentJobs;
	}

	get subagentUi(): Map<string, LionSubagentUiState> {
		return this.#subagentUi;
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

	createSubAgentController(ctx: ExtensionContext, runId: string): SubAgentController {
		const controller = createLionSubAgentController({
			ctx: ctx as ExtensionCommandContext,
		});
		this.#controllers.set(runId, controller);
		this.#activeController = controller;
		this.#activeRunId = runId;
		return controller;
	}

	restore(ctx: ExtensionContext): void {
		this.#state = this.persistence.restoreState(ctx);
		this.#core = restoreLionCore(ctx);
		this.#activeRunId = this.#core.activeRun?.runId ?? null;
		this.ui.updateStatus(ctx, this.#state);
	}

	persist(action: PersistedLionState["action"]): void {
		this.persistence.saveState(this.#state, action);
	}

	saveCore(action: "start" | "record" | "finish" | "restore"): void {
		this.persistence.saveCore(this.#core, action);
	}

	queueFeedback(ctx: ExtensionContext, content: string, details: Record<string, unknown>): void {
		const message = {
			customType: LION_ORCHESTRATOR_FEEDBACK_TYPE,
			content,
			display: false,
			details,
		};
		if (ctx.isIdle()) {
			this.#pi.sendMessage(message, { triggerTurn: true });
			return;
		}
		this.#pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
	}

	emit(event: LionEvent): void {
		this.events.emit(event);
	}

	retainSubagent(options: RetainedLionSubagent): void {
		this.#retainedInstances.set(options.taskId, options);
	}

	releaseRun(runId: string): void {
		this.#retainedInstances.forEach((subagent, taskId) => {
			if (subagent.runId === runId) this.#retainedInstances.delete(taskId);
		});
		this.#controllers.delete(runId);
		if (this.#activeRunId === runId) {
			this.#activeRunId = null;
			this.#activeController = null;
		}
	}

	startJob(options: {
		runId: string;
		taskId: string;
		role: LionSubagentRole;
		title: string;
		timestamp?: number;
	}): LionSubagentJob {
		const now = options.timestamp ?? Date.now();
		const job: LionSubagentJob = {
			runId: options.runId,
			taskId: options.taskId,
			role: options.role,
			title: options.title,
			status: "queued",
			startedAt: now,
			updatedAt: now,
			completedAt: null,
			result: null,
			error: null,
			lastEvents: [],
		};
		this.#subagentJobs.set(options.taskId, job);
		return job;
	}

	finishJob(taskId: string, result: DelegationResult | null, error?: string): LionSubagentJob | null {
		const job = this.#subagentJobs.get(taskId);
		if (!job) return null;
		const now = Date.now();
		const next: LionSubagentJob = {
			...job,
			status: result?.status === "completed" ? "completed" : "failed",
			updatedAt: now,
			completedAt: now,
			result,
			error: error ?? result?.error ?? null,
		};
		this.#subagentJobs.set(taskId, next);
		return next;
	}

	startSubagentUi(options: {
		runId: string;
		taskId: string;
		role: LionSubagentRole;
		title: string;
		timestamp?: number;
	}): void {
		const now = options.timestamp ?? Date.now();
		this.#subagentUi.set(options.taskId, {
			runId: options.runId,
			taskId: options.taskId,
			instanceId: "",
			role: options.role,
			title: options.title,
			status: "queued",
			turnCount: 0,
			toolCount: 0,
			currentTool: null,
			summary: null,
			startedAt: now,
			updatedAt: now,
			completedAt: null,
		});
	}

	recordSubagentUiEvent(event: SubAgentEvent): void {
		if (!("taskId" in event)) return;
		this.#recordJobEvent(event);
		const existing = this.#subagentUi.get(event.taskId);
		if (!existing) return;
		const next: LionSubagentUiState = { ...existing, instanceId: event.instanceId, updatedAt: event.timestamp };
		switch (event.type) {
			case "task.start":
				next.status = "running";
				next.title = event.description ?? next.title;
				break;
			case "turn.complete":
				next.turnCount = Math.max(next.turnCount, event.turnIndex + 1);
				next.toolCount += event.toolCount;
				break;
			case "tool.start":
				next.currentTool = event.toolName;
				break;
			case "tool.end":
				next.currentTool = null;
				break;
			case "progress.update":
				next.summary = event.message || next.summary;
				break;
			case "task.end":
				next.status = event.result.status === "completed" ? "completed" : "failed";
				next.currentTool = null;
				next.summary = event.result.summary;
				next.turnCount = event.result.turnCount;
				next.completedAt = event.timestamp;
				break;
			case "error":
				next.status = "failed";
				next.currentTool = null;
				next.summary = event.error;
				next.completedAt = event.timestamp;
				break;
			case "instance.state":
				next.turnCount = event.state.turnCount;
				next.currentTool = event.state.currentTool;
				break;
			default:
				break;
		}
		this.#subagentUi.set(event.taskId, next);
	}

	getSubagentHealth(taskId?: string): LionSubagentJob[] {
		const jobs = Array.from(this.#subagentJobs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
		if (!taskId) return jobs;
		return jobs.filter((job) => job.taskId === taskId);
	}

	// === Transiciones de estado ===

	activatePlanning(): void {
		this.#state = { ...this.#state, active: true, mode: "planning" };
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
	}

	setMode(mode: LionMode): void {
		this.#state = { ...this.#state, active: true, mode };
	}

	setActiveTask(taskId: string | null): void {
		this.#state = { ...this.#state, activeTaskId: taskId };
	}

	setLastRun(runId: string): void {
		this.#state = { ...this.#state, lastRunId: runId };
	}

	applyBuildResult(result: LionBuildResult): void {
		this.#state = { ...this.#state, mode: "planning", activeTaskId: null, lastBuild: result };
	}

	rememberUiContext(ctx: ExtensionContext): void {
		if (ctx.hasUI) this.#lastUiContext = ctx;
	}

	cleanupSubagentUi(now = Date.now(), retentionMs = 10000): void {
		const orphanedQueuedMs = 5 * 60 * 1000; // 5 min for queued states that never started
		for (const [taskId, state] of this.#subagentUi.entries()) {
			if (state.status === "running") continue;
			// Completed/failed: clean after retentionMs from completion
			if (state.completedAt && now - state.completedAt > retentionMs) {
				this.#subagentUi.delete(taskId);
				continue;
			}
			// Queued that never started: clean after orphanedQueuedMs
			if (state.status === "queued" && !state.completedAt && now - state.startedAt > orphanedQueuedMs) {
				this.#subagentUi.delete(taskId);
			}
		}
	}

	#recordJobEvent(event: SubAgentEvent): void {
		if (!("taskId" in event)) return;
		const job = this.#subagentJobs.get(event.taskId);
		if (!job) return;
		const next: LionSubagentJob = {
			...job,
			status: event.type === "task.start" ? "running" : job.status,
			updatedAt: event.timestamp,
			lastEvents: [...job.lastEvents, event].slice(-20),
		};
		if (event.type === "task.end") {
			next.status = event.result.status === "completed" ? "completed" : "failed";
			next.completedAt = event.timestamp;
			next.result = event.result;
			next.error = event.result.error ?? null;
		}
		if (event.type === "error") {
			next.status = "failed";
			next.completedAt = event.timestamp;
			next.error = event.error;
		}
		this.#subagentJobs.set(event.taskId, next);
	}
}
