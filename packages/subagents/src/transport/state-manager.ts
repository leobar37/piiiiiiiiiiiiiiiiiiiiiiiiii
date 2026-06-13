import type { SubAgentEvent, SubAgentInstanceState, SubAgentRunRecord, SubAgentState } from "../types.js";
import type { DashboardThreadState } from "./types.js";

export interface VirtualInstance extends DashboardThreadState {
	/** True when a live SubAgentInstance exists in the controller */
	isLive: boolean;
	/** Session file path for reading messages after restart */
	sessionFile?: string;
	/** Session id for identification */
	sessionId?: string;
}

/**
 * Manages dashboard-visible instance state across live and virtual instances.
 *
 * - Live instances: backed by a running SubAgentInstance in the controller
 * - Virtual instances: reconstructed from runStore records
 */
export class DashboardStateManager {
	private liveInstances = new Map<string, SubAgentInstanceState>();
	private virtualInstances = new Map<string, VirtualInstance>();
	private eventsByInstance = new Map<string, SubAgentEvent[]>();
	private runStore: { list(): Promise<SubAgentRunRecord[]> };

	constructor(_cwd: string, runStore?: { list(): Promise<SubAgentRunRecord[]> }) {
		this.runStore = runStore ?? { list: async () => [] };
	}

	/**
	 * Track live-process events and update the corresponding instance state.
	 * Durable reconstruction still comes from runStore records.
	 */
	async appendEvent(instanceId: string, event: SubAgentEvent): Promise<void> {
		const events = this.eventsByInstance.get(instanceId) ?? [];
		this.eventsByInstance.set(instanceId, [...events, event].slice(-500));

		// Update live instance state if we track it
		if (event.type === "instance.state" && "state" in event) {
			const state = (event as Record<string, unknown>).state as SubAgentInstanceState;
			this.liveInstances.set(instanceId, state);
		}
	}

	/**
	 * Register a live instance from the controller.
	 */
	registerLiveInstance(state: SubAgentInstanceState, sessionFile?: string, _sessionId?: string): void {
		this.liveInstances.set(state.instanceId, state);

		// If a virtual exists, merge session info and prefer live state
		if (this.virtualInstances.has(state.instanceId)) {
			this.virtualInstances.delete(state.instanceId);
		}

		// Also update any virtual that matches by session file
		if (sessionFile) {
			for (const [id, v] of this.virtualInstances) {
				if (v.sessionFile === sessionFile) {
					this.virtualInstances.delete(id);
				}
			}
		}
	}

	/**
	 * Unregister a live instance (e.g. when it completes).
	 */
	unregisterLiveInstance(instanceId: string): void {
		const live = this.liveInstances.get(instanceId);
		this.liveInstances.delete(instanceId);

		// If a live instance was removed and no virtual exists, create a basic one
		if (live) {
			const virtual: VirtualInstance = {
				...live,
				kind: "subagent",
				isLive: false,
				sessionFile: live.sessionFile,
				sessionId: live.sessionId,
				currentTool: null,
				currentToolStartedAt: null,
			};
			this.virtualInstances.set(instanceId, virtual);
		}
	}

	/**
	 * Get all instances (live + virtual), with live taking precedence.
	 * Virtual instances include both tracked (recently completed) and
	 * runStore-backed instances.
	 */
	getAllInstances(): VirtualInstance[] {
		const result = new Map<string, VirtualInstance>();

		// Add virtual instances first (from tracked memory)
		for (const [id, v] of this.virtualInstances) {
			result.set(id, { ...v });
		}

		// Override with live instances
		for (const [id, live] of this.liveInstances) {
			const existingVirtual = this.virtualInstances.get(id);
			result.set(id, {
				...live,
				kind: "subagent",
				isLive: true,
				sessionFile: live.sessionFile ?? existingVirtual?.sessionFile,
				sessionId: live.sessionId ?? existingVirtual?.sessionId,
				modelProvider: live.modelProvider ?? existingVirtual?.modelProvider,
				modelId: live.modelId ?? existingVirtual?.modelId,
			});
		}

		return Array.from(result.values());
	}

	getInstance(instanceId: string): VirtualInstance | undefined {
		const live = this.liveInstances.get(instanceId);
		if (live) {
			const virtual = this.virtualInstances.get(instanceId);
			return {
				...live,
				kind: "subagent",
				isLive: true,
				sessionFile: live.sessionFile ?? virtual?.sessionFile,
				sessionId: live.sessionId ?? virtual?.sessionId,
				modelProvider: live.modelProvider ?? virtual?.modelProvider,
				modelId: live.modelId ?? virtual?.modelId,
			};
		}

		const existing = this.virtualInstances.get(instanceId);
		if (existing) return existing;

		return undefined;
	}

	isLive(instanceId: string): boolean {
		return this.liveInstances.has(instanceId);
	}

	/**
	 * Get live-process events for an instance.
	 */
	getEvents(instanceId: string): Promise<SubAgentEvent[]> {
		return Promise.resolve([...(this.eventsByInstance.get(instanceId) ?? [])]);
	}

	/**
	 * Return all known instance IDs from virtual instances in memory.
	 */
	async getAllInstanceIds(): Promise<string[]> {
		return Array.from(
			new Set([...this.virtualInstances.keys(), ...this.liveInstances.keys(), ...this.eventsByInstance.keys()]),
		);
	}

	/**
	 * Build a virtual instance from a run record for display purposes.
	 * Uses run record metadata (prompt, summary, status, etc.).
	 */
	buildVirtualFromRun(record: SubAgentRunRecord): VirtualInstance {
		const endTime = record.completedAt ?? (record.status === "running" ? null : record.updatedAt);
		const state = mapRunStatusToState(record.status);

		return {
			instanceId: record.instanceId,
			taskId: record.taskId,
			definitionName: record.definitionName,
			cwd: record.cwd,
			parentThreadId: record.parentThreadId,
			parentToolCallId: record.parentToolCallId,
			runId: record.runId,
			runIndex: record.runIndex,
			description: record.description,
			state,
			startTime: record.startedAt,
			endTime,
			turnCount: record.turnCount,
			lastActivityAt: record.updatedAt,
			currentTool: null,
			error: record.error ?? null,
			toolCount: record.toolCount,
			currentToolStartedAt: null,
			durationMs: endTime ? endTime - record.startedAt : Date.now() - record.startedAt,
			kind: "subagent",
			isLive: false,
			sessionId: record.sessionId,
			modelProvider: record.modelProvider,
			modelId: record.modelId,
		};
	}

	/**
	 * Load virtual instances from runStore, adding any that are not already tracked.
	 */
	async loadFromRunStore(): Promise<void> {
		try {
			const records = await this.runStore.list();
			for (const record of records) {
				if (this.liveInstances.has(record.instanceId)) continue;
				if (this.virtualInstances.has(record.instanceId)) continue;
				const virtual = this.buildVirtualFromRun(record);
				this.virtualInstances.set(record.instanceId, virtual);
			}
		} catch {
			// best effort
		}
	}
}

function mapRunStatusToState(status: SubAgentRunRecord["status"]): SubAgentState {
	switch (status) {
		case "completed":
			return "completed";
		case "blocked":
			return "blocked";
		case "running":
			return "running";
		case "cancelled":
			return "cancelled";
		case "timed_out":
			return "timed_out";
		default:
			return "failed";
	}
}
