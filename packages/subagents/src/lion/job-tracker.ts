import type { DelegationResult, SubAgentEvent, SubAgentState } from "../types.js";
import type { LionSubagentRole } from "./core.js";

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
	status: LionVisibleSubagentStatus;
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
	status: LionVisibleSubagentStatus;
	startedAt: number;
	updatedAt: number;
	completedAt: number | null;
	result: DelegationResult | null;
	error: string | null;
	lastEvents: SubAgentEvent[];
}

export type LionVisibleSubagentStatus =
	| "stalled"
	| "queued"
	| Extract<SubAgentState, "starting" | "running" | "completed" | "blocked" | "failed">;

export class SubagentJobManager {
	#subagentJobs: Map<string, LionSubagentJob>;
	#subagentUi: Map<string, LionSubagentUiState>;
	#retainedInstances: Map<string, RetainedLionSubagent>;

	constructor() {
		this.#subagentJobs = new Map();
		this.#subagentUi = new Map();
		this.#retainedInstances = new Map();
	}

	get subagentJobs(): Map<string, LionSubagentJob> {
		return this.#subagentJobs;
	}

	get subagentUi(): Map<string, LionSubagentUiState> {
		return this.#subagentUi;
	}

	get retainedInstances(): Map<string, RetainedLionSubagent> {
		return this.#retainedInstances;
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
		const status = this.normalizeJobStatus(result?.status ?? "failed");
		const next: LionSubagentJob = {
			...job,
			status,
			updatedAt: now,
			completedAt: now,
			result,
			error: error ?? result?.error ?? null,
		};
		this.#subagentJobs.set(taskId, next);
		return next;
	}

	private normalizeJobStatus(status: string): LionVisibleSubagentStatus {
		switch (status) {
			case "completed":
				return "completed";
			case "blocked":
				return "blocked";
			case "timed_out":
			case "cancelled":
				return "failed";
			default:
				return "failed";
		}
	}

	getSubagentHealth(taskId?: string): LionSubagentJob[] {
		this.markStalledJobs(Date.now(), undefined, true);
		const jobs = Array.from(this.#subagentJobs.values()).sort((a, b) => b.updatedAt - a.updatedAt);
		if (!taskId) return jobs;
		return jobs.filter((job) => job.taskId === taskId);
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
		if (!event.instanceId) return;
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
				next.status =
					event.result.status === "completed"
						? "completed"
						: event.result.status === "blocked"
							? "blocked"
							: "failed";
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
				next.status = normalizeVisibleSubagentState(event.state.state, next.status);
				next.turnCount = event.state.turnCount;
				next.currentTool = event.state.currentTool;
				next.completedAt = event.state.endTime;
				next.summary = event.state.error ?? next.summary;
				break;
			default:
				break;
		}
		this.#subagentUi.set(event.taskId, next);
	}

	cleanupSubagentUi(now = Date.now(), retentionMs = 10000): void {
		this.markStalledJobs(now);
		const orphanedQueuedMs = 5 * 60 * 1000; // 5 min for queued states that never started
		for (const [taskId, state] of this.#subagentUi.entries()) {
			if (state.status === "running") continue;
			// Completed/failed: clean after retentionMs from completion
			if (state.completedAt && now - state.completedAt > retentionMs) {
				this.#subagentUi.delete(taskId);
				this.#subagentJobs.delete(taskId);
				continue;
			}
			// Queued that never started: clean after orphanedQueuedMs
			if (
				(state.status === "queued" || state.status === "stalled") &&
				!state.completedAt &&
				now - state.startedAt > orphanedQueuedMs
			) {
				this.#subagentUi.delete(taskId);
				this.#subagentJobs.delete(taskId);
			}
		}
	}

	cleanupJobs(now = Date.now(), retentionMs = 60 * 60 * 1000): void {
		// Clean up completed/failed jobs older than retentionMs (default 1 hour)
		for (const [taskId, job] of this.#subagentJobs.entries()) {
			if (job.status === "running" || job.status === "queued" || job.status === "starting") continue;
			if (job.completedAt && now - job.completedAt > retentionMs) {
				this.#subagentJobs.delete(taskId);
			}
		}
	}

	retainSubagent(options: RetainedLionSubagent): void {
		this.#retainedInstances.set(options.taskId, options);
	}

	releaseRun(runId: string): void {
		this.#retainedInstances.forEach((subagent, taskId) => {
			if (subagent.runId === runId) this.#retainedInstances.delete(taskId);
		});
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
		if (event.type === "instance.state") {
			next.status = normalizeVisibleSubagentState(event.state.state, next.status);
			next.completedAt = event.state.endTime;
			next.error = event.state.error;
		}
		if (event.type === "task.end") {
			next.status =
				event.result.status === "completed"
					? "completed"
					: event.result.status === "blocked"
						? "blocked"
						: "failed";
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

	private markStalledJobs(now = Date.now(), thresholdMs = 2 * 60 * 1000, includeRunning = false): void {
		for (const [taskId, job] of this.#subagentJobs.entries()) {
			if (job.status !== "queued" && job.status !== "starting" && (!includeRunning || job.status !== "running")) {
				continue;
			}
			if (now - job.updatedAt <= thresholdMs) continue;
			this.#subagentJobs.set(taskId, {
				...job,
				status: "stalled",
				error: job.error ?? `No subagent activity for ${thresholdMs}ms`,
			});
		}
		for (const [taskId, state] of this.#subagentUi.entries()) {
			if (
				state.status !== "queued" &&
				state.status !== "starting" &&
				(!includeRunning || state.status !== "running")
			) {
				continue;
			}
			if (now - state.updatedAt <= thresholdMs) continue;
			this.#subagentUi.set(taskId, {
				...state,
				status: "stalled",
				summary: state.summary ?? `No subagent activity for ${thresholdMs}ms`,
			});
		}
	}
}

function normalizeVisibleSubagentState(
	state: SubAgentState,
	fallback: LionVisibleSubagentStatus,
): LionVisibleSubagentStatus {
	switch (state) {
		case "starting":
		case "running":
		case "completed":
		case "blocked":
		case "failed":
			return state;
		case "completing":
			return "running";
		case "cancelled":
		case "timed_out":
			return "failed";
		default:
			return fallback;
	}
}
