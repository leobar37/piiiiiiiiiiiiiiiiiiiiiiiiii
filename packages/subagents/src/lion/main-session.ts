import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import type { DashboardSessionSource, DashboardThreadState } from "../transport/types.js";
import type { SubAgentEvent, SubAgentInstanceState } from "../types.js";
import type { LionBuildResult } from "./types.js";

type MainSessionRuntimeEvent =
	| Extract<ExtensionEvent, { type: "agent_start" }>
	| Extract<ExtensionEvent, { type: "agent_end" }>
	| Extract<ExtensionEvent, { type: "turn_start" }>
	| Extract<ExtensionEvent, { type: "turn_end" }>
	| Extract<ExtensionEvent, { type: "message_start" }>
	| Extract<ExtensionEvent, { type: "message_update" }>
	| Extract<ExtensionEvent, { type: "message_end" }>
	| Extract<ExtensionEvent, { type: "tool_execution_start" }>
	| Extract<ExtensionEvent, { type: "tool_execution_end" }>;

export class MainSessionBridge implements DashboardSessionSource {
	private thread: DashboardThreadState | null = null;
	private messages: AgentMessage[] = [];
	private events: SubAgentEvent[] = [];
	private listeners = new Set<(event: SubAgentEvent) => void>();
	private currentTool: string | null = null;
	private turnCount = 0;
	private toolCount = 0;
	private startTime: number | null = null;
	private endTime: number | null = null;
	private currentToolStartedAt: number | null = null;

	attach(ctx: ExtensionContext): void {
		const now = Date.now();
		const sessionId = ctx.sessionManager.getSessionId();
		const threadId = this.threadId(sessionId);
		const isNewThread = this.thread?.instanceId !== threadId;
		this.messages = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId()).messages;
		this.thread = {
			instanceId: threadId,
			taskId: "main",
			definitionName: "main-agent",
			description: ctx.sessionManager.getSessionName() ?? "Main agent",
			state: ctx.isIdle() ? "paused" : "running",
			startTime: this.startTime,
			endTime: this.endTime,
			turnCount: this.turnCount,
			lastActivityAt: now,
			currentTool: this.currentTool,
			error: null,
			toolCount: this.toolCount,
			currentToolStartedAt: this.currentToolStartedAt,
			durationMs: this.startTime ? now - this.startTime : 0,
			kind: "main",
			isLive: true,
			sessionFile: ctx.sessionManager.getSessionFile(),
			sessionId,
			modelProvider: ctx.model?.provider,
			modelId: ctx.model?.id,
		};
		if (isNewThread) {
			this.emit({
				type: "instance.created",
				instanceId: threadId,
				taskId: "main",
				definitionName: "main-agent",
				timestamp: now,
			});
		}
		this.emit({
			type: "instance.state",
			instanceId: threadId,
			taskId: "main",
			state: this.thread,
			timestamp: now,
		});
	}

	record(event: MainSessionRuntimeEvent, ctx: ExtensionContext): void {
		this.attach(ctx);
		if (!this.thread) return;

		const now = Date.now();
		const threadId = this.thread.instanceId;
		const previousState = this.thread.state;

		switch (event.type) {
			case "agent_start":
				this.startTime = now;
				this.endTime = null;
				this.currentTool = null;
				this.currentToolStartedAt = null;
				this.patchState({ state: "running", startTime: this.startTime, endTime: null, lastActivityAt: now });
				this.emitLifecycle(threadId, previousState, "running", now);
				break;
			case "agent_end":
				this.messages = event.messages;
				this.endTime = now;
				this.currentTool = null;
				this.currentToolStartedAt = null;
				this.patchState({
					state: "completed",
					endTime: now,
					currentTool: null,
					currentToolStartedAt: null,
					lastActivityAt: now,
				});
				this.emitLifecycle(threadId, previousState, "completed", now);
				break;
			case "turn_start":
				this.patchState({ state: "running", lastActivityAt: now });
				break;
			case "turn_end":
				this.turnCount = Math.max(this.turnCount, event.turnIndex + 1);
				this.messages = buildSessionContext(
					ctx.sessionManager.getEntries(),
					ctx.sessionManager.getLeafId(),
				).messages;
				this.patchState({ turnCount: this.turnCount, lastActivityAt: now });
				this.emit({
					type: "turn.complete",
					instanceId: threadId,
					taskId: "main",
					turnIndex: event.turnIndex,
					toolCount: event.toolResults.length,
					hadError: event.toolResults.some((result) => result.isError),
					timestamp: now,
				});
				break;
			case "message_start":
			case "message_update":
			case "message_end":
				this.messages = buildSessionContext(
					ctx.sessionManager.getEntries(),
					ctx.sessionManager.getLeafId(),
				).messages;
				this.emitSessionEvent(threadId, event, now);
				break;
			case "tool_execution_start":
				this.currentTool = event.toolName;
				this.currentToolStartedAt = now;
				this.toolCount++;
				this.patchState({
					currentTool: event.toolName,
					currentToolStartedAt: now,
					toolCount: this.toolCount,
					lastActivityAt: now,
				});
				this.emit({
					type: "tool.start",
					instanceId: threadId,
					taskId: "main",
					toolName: event.toolName,
					toolCallId: event.toolCallId,
					timestamp: now,
				});
				break;
			case "tool_execution_end":
				this.currentTool = null;
				this.currentToolStartedAt = null;
				this.patchState({ currentTool: null, currentToolStartedAt: null, lastActivityAt: now });
				this.emit({
					type: "tool.end",
					instanceId: threadId,
					taskId: "main",
					toolName: event.toolName,
					toolCallId: event.toolCallId,
					isError: event.isError,
					timestamp: now,
				});
				break;
		}

		if (this.thread) {
			this.emit({
				type: "instance.state",
				instanceId: threadId,
				taskId: "main",
				state: this.thread,
				timestamp: now,
			});
		}
	}

	notifyRunComplete(_result: LionBuildResult): void {
		if (!this.thread) return;
		const now = Date.now();
		this.endTime = now;
		this.currentTool = null;
		this.currentToolStartedAt = null;
		const previousState = this.thread.state;
		this.patchState({
			state: "completed",
			endTime: now,
			currentTool: null,
			currentToolStartedAt: null,
			lastActivityAt: now,
		});
		this.emitLifecycle(this.thread.instanceId, previousState, "completed", now);
		this.emit({
			type: "instance.state",
			instanceId: this.thread.instanceId,
			taskId: "main",
			state: this.thread,
			timestamp: now,
		});
	}

	getThread(): DashboardThreadState | null {
		return this.thread ? { ...this.thread } : null;
	}

	getMessages(threadId: string): AgentMessage[] | null {
		if (!this.thread || this.thread.instanceId !== threadId) return null;
		return this.messages;
	}

	getEvents(threadId: string): SubAgentEvent[] {
		if (!this.thread || this.thread.instanceId !== threadId) return [];
		return this.events;
	}

	subscribe(listener: (event: SubAgentEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private threadId(sessionId: string): string {
		return `main:${sessionId}`;
	}

	private patchState(patch: Partial<SubAgentInstanceState>): void {
		if (!this.thread) return;
		const now = Date.now();
		this.thread = {
			...this.thread,
			...patch,
			durationMs: this.startTime ? (this.endTime ?? now) - this.startTime : 0,
		};
	}

	private emitLifecycle(
		threadId: string,
		previous: SubAgentInstanceState["state"],
		current: SubAgentInstanceState["state"],
		timestamp: number,
	): void {
		if (previous === current) return;
		this.emit({
			type: "lifecycle.change",
			instanceId: threadId,
			previous,
			current,
			timestamp,
		});
	}

	private emitSessionEvent(threadId: string, event: MainSessionRuntimeEvent, timestamp: number): void {
		this.emit({
			type: "session.event",
			instanceId: threadId,
			taskId: "main",
			sessionEvent: event as unknown as Record<string, unknown>,
			timestamp,
		});
	}

	private emit(event: SubAgentEvent): void {
		this.events.push(event);
		for (const listener of this.listeners) {
			listener(event);
		}
	}
}
