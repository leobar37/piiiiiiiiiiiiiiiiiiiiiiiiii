import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DashboardDaemon } from "@local/pi-dashboard";
import type { DelegationResult, SubAgentController, SubAgentEvent } from "@local/pi-subagents";
import {
	buildPersistedLionCore,
	createLionCore,
	LION_CORE_ENTRY_TYPE,
	type LionCore,
	type LionSubagentRole,
	restoreLionCore,
} from "./core.js";
import type { LionDashboardBridge } from "./dashboard-bridge.js";
import { LionEventBus } from "./events/bus.js";
import { createInitialLionState } from "./state.js";
import { LION_STATE_ENTRY_TYPE, type LionState, type PersistedLionState } from "./types.js";
import { updateLionStatus } from "./ui.js";

export const LION_ORCHESTRATOR_FEEDBACK_TYPE = "lion-orchestrator-feedback";

export class LionPersistence {
	readonly #pi: ExtensionAPI;

	constructor(pi: ExtensionAPI) {
		this.#pi = pi;
	}

	restore(runtime: LionRuntime, ctx: ExtensionContext): void {
		runtime.state = this.#restoreState(ctx);
		runtime.core = restoreLionCore(ctx);
		runtime.activeRunId = runtime.core.activeRun?.runId ?? null;
		updateLionStatus(ctx, runtime.state);
	}

	saveState(state: LionState, action: PersistedLionState["action"]): void {
		this.#pi.appendEntry(LION_STATE_ENTRY_TYPE, { ...state, action, updatedAt: Date.now() });
	}

	saveCore(core: LionCore, action: "start" | "record" | "finish" | "restore"): void {
		this.#pi.appendEntry(LION_CORE_ENTRY_TYPE, buildPersistedLionCore(core, action));
	}

	#restoreState(ctx: ExtensionContext): LionState {
		let lastState: PersistedLionState | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== LION_STATE_ENTRY_TYPE) continue;
			lastState = entry.data as PersistedLionState | undefined;
		}
		if (!lastState || lastState.version !== 1) return createInitialLionState();
		const { action: _action, updatedAt: _updatedAt, ...state } = lastState;
		return state;
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

export interface LionRuntime {
	pi: ExtensionAPI;
	persistence: LionPersistence;
	state: LionState;
	core: LionCore;
	events: LionEventBus;
	controllers: Map<string, SubAgentController>;
	activeController: SubAgentController | null;
	activeRunId: string | null;
	retainedInstances: Map<string, RetainedLionSubagent>;
	subagentJobs: Map<string, LionSubagentJob>;
	subagentUi: Map<string, LionSubagentUiState>;
	lastUiContext: ExtensionContext | null;
	widgetTimer: ReturnType<typeof setInterval> | null;
	dashboard?: DashboardDaemon;
	dashboardBridge?: LionDashboardBridge;
}

export function createLionRuntime(pi: ExtensionAPI): LionRuntime {
	return {
		pi,
		persistence: new LionPersistence(pi),
		state: createInitialLionState(),
		core: createLionCore(),
		events: new LionEventBus(),
		controllers: new Map(),
		activeController: null,
		activeRunId: null,
		retainedInstances: new Map(),
		subagentJobs: new Map(),
		subagentUi: new Map(),
		lastUiContext: null,
		widgetTimer: null,
	};
}

export function retainSubagent(runtime: LionRuntime, options: RetainedLionSubagent): void {
	runtime.retainedInstances.set(options.taskId, options);
}

export function releaseRun(runtime: LionRuntime, runId: string): void {
	runtime.retainedInstances.forEach((subagent, taskId) => {
		if (subagent.runId === runId) runtime.retainedInstances.delete(taskId);
	});
	runtime.controllers.delete(runId);
	if (runtime.activeRunId === runId) runtime.activeRunId = null;
	if (runtime.activeController && runtime.core.activeRun?.runId !== runId) runtime.activeController = null;
}

export function startLionSubagentJob(
	runtime: LionRuntime,
	options: { runId: string; taskId: string; role: LionSubagentRole; title: string; timestamp?: number },
): LionSubagentJob {
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
	runtime.subagentJobs.set(options.taskId, job);
	return job;
}

export function finishLionSubagentJob(
	runtime: LionRuntime,
	taskId: string,
	result: DelegationResult | null,
	error?: string,
): LionSubagentJob | null {
	const job = runtime.subagentJobs.get(taskId);
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
	runtime.subagentJobs.set(taskId, next);
	return next;
}

export function startLionSubagentUi(
	runtime: LionRuntime,
	options: { runId: string; taskId: string; role: LionSubagentRole; title: string; timestamp?: number },
): void {
	const now = options.timestamp ?? Date.now();
	runtime.subagentUi.set(options.taskId, {
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

export function recordLionSubagentUiEvent(runtime: LionRuntime, event: SubAgentEvent): void {
	if (!("taskId" in event)) return;
	recordLionSubagentJobEvent(runtime, event);
	const existing = runtime.subagentUi.get(event.taskId);
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
	runtime.subagentUi.set(event.taskId, next);
}

function recordLionSubagentJobEvent(runtime: LionRuntime, event: SubAgentEvent): void {
	if (!("taskId" in event)) return;
	const job = runtime.subagentJobs.get(event.taskId);
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
	runtime.subagentJobs.set(event.taskId, next);
}

export function getLionSubagentHealth(runtime: LionRuntime, taskId?: string): LionSubagentJob[] {
	const jobs = Array.from(runtime.subagentJobs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
	if (!taskId) return jobs;
	return jobs.filter((job) => job.taskId === taskId);
}

export function rememberLionUiContext(runtime: LionRuntime, ctx: ExtensionContext): void {
	if (ctx.hasUI) runtime.lastUiContext = ctx;
}

export function cleanupLionSubagentUi(runtime: LionRuntime, now = Date.now(), retentionMs = 10000): void {
	for (const [taskId, state] of runtime.subagentUi.entries()) {
		if (
			state.status !== "running" &&
			state.status !== "queued" &&
			state.completedAt &&
			now - state.completedAt > retentionMs
		) {
			runtime.subagentUi.delete(taskId);
		}
	}
}

export function queueOrchestratorFeedback(
	runtime: LionRuntime,
	ctx: ExtensionContext,
	content: string,
	details: Record<string, unknown>,
): void {
	const message = {
		customType: LION_ORCHESTRATOR_FEEDBACK_TYPE,
		content,
		display: false,
		details,
	};
	if (ctx.isIdle()) {
		runtime.pi.sendMessage(message, { triggerTurn: true });
		return;
	}
	runtime.pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
}
