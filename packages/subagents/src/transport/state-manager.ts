import type { SubAgentEvent, SubAgentInstanceState, SubAgentState } from "../types.js";
import { SubAgentEventStore } from "./event-store.js";
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
 * - Virtual instances: reconstructed from persisted events after Pi restart
 */
export class DashboardStateManager {
	private readonly eventStore: SubAgentEventStore;
	private liveInstances = new Map<string, SubAgentInstanceState>();
	private virtualInstances = new Map<string, VirtualInstance>();

	constructor(cwd: string) {
		this.eventStore = new SubAgentEventStore(cwd);
	}

	/**
	 * Rehydrate virtual instances from disk on transport start.
	 */
	async rehydrate(): Promise<void> {
		const instanceIds = await this.eventStore.readAllInstanceIds();
		for (const id of instanceIds) {
			const events = await this.eventStore.read(id);
			const virtual = this.rebuildVirtualInstance(id, events);
			this.virtualInstances.set(id, virtual);
		}
	}

	/**
	 * Persist an event and update the corresponding instance state.
	 */
	async appendEvent(instanceId: string, event: SubAgentEvent): Promise<void> {
		await this.eventStore.append(instanceId, event);

		// Update live instance state if we track it
		if (event.type === "instance.state" && "state" in event) {
			const state = (event as Record<string, unknown>).state as SubAgentInstanceState;
			this.liveInstances.set(instanceId, state);
		}

		// Update virtual instance state from event
		const virtual = this.virtualInstances.get(instanceId);
		if (virtual) {
			const updated = this.applyEventToVirtual(virtual, event);
			this.virtualInstances.set(instanceId, updated);
		}
	}

	/**
	 * Register a live instance from the controller.
	 */
	registerLiveInstance(state: SubAgentInstanceState, sessionFile?: string, _sessionId?: string): void {
		this.liveInstances.set(state.instanceId, state);

		// If a virtual exists, merge session info and prefer live state
		const virtual = this.virtualInstances.get(state.instanceId);
		if (virtual) {
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

		// Rebuild virtual from persisted events
		if (live) {
			this.eventStore
				.read(instanceId)
				.then((events) => {
					const virtual = this.rebuildVirtualInstance(instanceId, events);
					this.virtualInstances.set(instanceId, virtual);
				})
				.catch(() => {
					/* best effort */
				});
		}
	}

	/**
	 * Get all instances (live + virtual), with live taking precedence.
	 */
	getAllInstances(): VirtualInstance[] {
		const result = new Map<string, VirtualInstance>();

		// Add virtual instances first
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
				sessionFile: existingVirtual?.sessionFile,
				sessionId: existingVirtual?.sessionId,
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
				sessionFile: virtual?.sessionFile,
				sessionId: virtual?.sessionId,
				modelProvider: live.modelProvider ?? virtual?.modelProvider,
				modelId: live.modelId ?? virtual?.modelId,
			};
		}
		return this.virtualInstances.get(instanceId);
	}

	isLive(instanceId: string): boolean {
		return this.liveInstances.has(instanceId);
	}

	getEvents(instanceId: string): Promise<SubAgentEvent[]> {
		return this.eventStore.read(instanceId);
	}

	/**
	 * Return all known instance IDs (from persisted event files).
	 */
	async getAllInstanceIds(): Promise<string[]> {
		return this.eventStore.readAllInstanceIds();
	}

	// =====================================================================
	// Internal: rebuild virtual instance from event history
	// =====================================================================

	private rebuildVirtualInstance(instanceId: string, events: SubAgentEvent[]): VirtualInstance {
		const created = events.find((e) => e.type === "instance.created") as
			| (SubAgentEvent & {
					taskId?: string;
					definitionName?: string;
					parentThreadId?: string;
					parentToolCallId?: string;
					runId?: string;
					runIndex?: number;
			  })
			| undefined;

		const lastStateEvent = [...events].reverse().find((e) => e.type === "instance.state") as
			| (SubAgentEvent & { state?: SubAgentInstanceState })
			| undefined;

		const taskEnd = [...events].reverse().find((e) => e.type === "task.end") as
			| (SubAgentEvent & { result?: { status?: string; error?: string } })
			| undefined;

		const sessionInfo = events.find((e) => e.type === "instance.session") as
			| (SubAgentEvent & { sessionFile?: string; sessionId?: string })
			| undefined;

		const errorEvent = [...events].reverse().find((e) => e.type === "error") as
			| (SubAgentEvent & { error?: string })
			| undefined;

		// Determine final state
		let state: SubAgentState = "created";
		if (taskEnd) {
			state = taskEnd.result?.status === "completed" ? "completed" : "failed";
		} else if (errorEvent) {
			state = "failed";
		} else if (lastStateEvent?.state) {
			state = lastStateEvent.state.state;
		}

		const startTime = created?.timestamp ?? events[0]?.timestamp ?? null;
		const endTime =
			taskEnd?.timestamp ??
			(state !== "running" && state !== "starting" ? (events[events.length - 1]?.timestamp ?? null) : null);

		return {
			instanceId,
			taskId: created?.taskId ?? lastStateEvent?.state?.taskId ?? "",
			definitionName: created?.definitionName ?? lastStateEvent?.state?.definitionName ?? "unknown",
			parentThreadId: created?.parentThreadId ?? lastStateEvent?.state?.parentThreadId,
			parentToolCallId: created?.parentToolCallId ?? lastStateEvent?.state?.parentToolCallId,
			runId: created?.runId ?? lastStateEvent?.state?.runId,
			runIndex: created?.runIndex ?? lastStateEvent?.state?.runIndex,
			description: lastStateEvent?.state?.description,
			state,
			startTime,
			endTime,
			turnCount: lastStateEvent?.state?.turnCount ?? this.countTurns(events),
			lastActivityAt: events[events.length - 1]?.timestamp ?? Date.now(),
			currentTool: null,
			error: errorEvent?.error ?? taskEnd?.result?.error ?? null,
			toolCount: lastStateEvent?.state?.toolCount ?? this.countTools(events),
			currentToolStartedAt: null,
			durationMs: startTime && endTime ? endTime - startTime : startTime ? Date.now() - startTime : 0,
			kind: "subagent",
			isLive: false,
			sessionFile: sessionInfo?.sessionFile,
			sessionId: sessionInfo?.sessionId,
			modelProvider: lastStateEvent?.state?.modelProvider,
			modelId: lastStateEvent?.state?.modelId,
		};
	}

	private applyEventToVirtual(virtual: VirtualInstance, event: SubAgentEvent): VirtualInstance {
		const next = { ...virtual };

		switch (event.type) {
			case "lifecycle.change": {
				const e = event as SubAgentEvent & { current?: SubAgentState };
				if (e.current) next.state = e.current;
				break;
			}
			case "instance.state": {
				const e = event as SubAgentEvent & { state?: SubAgentInstanceState };
				if (e.state) {
					next.state = e.state.state;
					next.turnCount = e.state.turnCount;
					next.toolCount = e.state.toolCount;
					next.currentTool = e.state.currentTool;
					next.error = e.state.error;
					next.parentThreadId = e.state.parentThreadId;
					next.parentToolCallId = e.state.parentToolCallId;
					next.runId = e.state.runId;
					next.runIndex = e.state.runIndex;
					next.modelProvider = e.state.modelProvider;
					next.modelId = e.state.modelId;
				}
				break;
			}
			case "turn.complete": {
				const e = event as SubAgentEvent & { turnIndex?: number; toolCount?: number };
				next.turnCount = Math.max(next.turnCount, (e.turnIndex ?? 0) + 1);
				next.toolCount += e.toolCount ?? 0;
				break;
			}
			case "tool.start": {
				const e = event as SubAgentEvent & { toolName?: string };
				next.currentTool = e.toolName ?? null;
				break;
			}
			case "tool.end": {
				next.currentTool = null;
				break;
			}
			case "task.end": {
				const e = event as SubAgentEvent & { result?: { status?: string; error?: string } };
				next.state = e.result?.status === "completed" ? "completed" : "failed";
				next.error = e.result?.error ?? null;
				next.endTime = event.timestamp;
				break;
			}
			case "error": {
				next.state = "failed";
				const e = event as SubAgentEvent & { error?: string };
				next.error = e.error ?? "Unknown error";
				next.endTime = event.timestamp;
				break;
			}
			case "instance.session": {
				const e = event as SubAgentEvent & { sessionFile?: string; sessionId?: string };
				next.sessionFile = e.sessionFile;
				next.sessionId = e.sessionId;
				break;
			}
		}

		next.lastActivityAt = event.timestamp;
		if (next.startTime) {
			next.durationMs = next.endTime ? next.endTime - next.startTime : event.timestamp - next.startTime;
		}

		return next;
	}

	private countTurns(events: SubAgentEvent[]): number {
		const turnEvents = events.filter((e) => e.type === "turn.complete");
		if (turnEvents.length === 0) return 0;
		const indices = turnEvents.map((e) => (e as SubAgentEvent & { turnIndex?: number }).turnIndex ?? 0);
		return Math.max(...indices) + 1;
	}

	private countTools(events: SubAgentEvent[]): number {
		return events.filter((e) => e.type === "tool.start").length;
	}
}
