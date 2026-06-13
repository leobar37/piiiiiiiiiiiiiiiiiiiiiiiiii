import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import {
	formatDashboardCommands,
	formatDashboardModels,
	type ThreadPromptImage,
	type ThreadPromptMode,
} from "../api/session-control.js";
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
	private lastContext: ExtensionContext | null = null;
	private pi: ExtensionAPI | null;

	constructor(pi?: ExtensionAPI) {
		this.pi = pi ?? null;
	}

	setApi(pi: ExtensionAPI): void {
		this.pi = pi;
	}

	attach(ctx: ExtensionContext): void {
		this.lastContext = ctx;
		const now = Date.now();
		const sessionId = ctx.sessionManager.getSessionId();
		const threadId = this.threadId(sessionId);
		const isNewThread = this.thread?.instanceId !== threadId;
		const snapshot = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId()).messages;
		this.messages = isNewThread ? snapshot : mergeAgentMessages(snapshot, this.messages);
		this.thread = {
			instanceId: threadId,
			taskId: "main",
			definitionName: "main-agent",
			cwd: ctx.sessionManager.getCwd(),
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
				this.messages = mergeAgentMessages(this.messages, event.messages);
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
				this.messages = mergeAgentMessages(
					buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId()).messages,
					this.messages,
				);
				this.patchState({ turnCount: this.turnCount, lastActivityAt: now });
				this.emitSessionSnapshot(threadId, now);
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
				this.messages = upsertAgentMessage(this.messages, event.message);
				this.emitSessionEvent(threadId, event, now);
				if (event.type === "message_end") {
					this.emit({
						type: "session.message.complete",
						instanceId: threadId,
						taskId: "main",
						message: event.message,
						timestamp: now,
					});
				}
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

	async sendMessage(
		threadId: string,
		message: string,
		mode: ThreadPromptMode,
		images?: ThreadPromptImage[],
	): Promise<void> {
		if (!this.thread || this.thread.instanceId !== threadId || !this.pi) {
			throw new Error("Main session is not controllable");
		}
		const content = images?.length ? [{ type: "text" as const, text: message }, ...images] : message;
		if (mode === "follow_up") {
			this.pi.sendUserMessage(content, { deliverAs: "followUp" });
			return;
		}
		if (mode === "steer") {
			this.pi.sendUserMessage(content, { deliverAs: "steer" });
			return;
		}
		this.pi.sendUserMessage(content, { executeCommands: true });
	}

	abort(threadId: string): void {
		if (!this.thread || this.thread.instanceId !== threadId || !this.lastContext) {
			throw new Error("Main session is not controllable");
		}
		this.lastContext.abort();
	}

	getCommands(threadId: string) {
		if (!this.thread || this.thread.instanceId !== threadId || !this.pi) return [];
		return formatDashboardCommands(this.pi.getCommands());
	}

	async getModels(threadId: string) {
		if (!this.thread || this.thread.instanceId !== threadId || !this.lastContext) return [];
		return formatDashboardModels(await this.lastContext.modelRegistry.getAvailable());
	}

	async setModel(threadId: string, provider: string, modelId: string): Promise<boolean> {
		if (!this.thread || this.thread.instanceId !== threadId || !this.lastContext || !this.pi) return false;
		const model = this.lastContext.modelRegistry.find(provider, modelId);
		if (!model) return false;
		const selected = await this.pi.setModel(model);
		if (selected) {
			this.patchState({ modelProvider: model.provider, modelId: model.id, lastActivityAt: Date.now() });
			this.emit({
				type: "instance.state",
				instanceId: threadId,
				taskId: "main",
				state: this.thread,
				timestamp: Date.now(),
			});
		}
		return selected;
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

	private emitSessionSnapshot(threadId: string, timestamp: number): void {
		this.emit({
			type: "session.snapshot",
			instanceId: threadId,
			taskId: "main",
			messages: this.messages,
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

function mergeAgentMessages(base: AgentMessage[], overlay: AgentMessage[]): AgentMessage[] {
	let merged = base;
	for (const message of overlay) {
		merged = upsertAgentMessage(merged, message);
	}
	return merged;
}

function upsertAgentMessage(messages: AgentMessage[], message: AgentMessage): AgentMessage[] {
	const key = agentMessageKey(message);
	const existingIndex = messages.findIndex((candidate) => agentMessageKey(candidate) === key);
	const next =
		existingIndex >= 0
			? messages.map((candidate, index) => (index === existingIndex ? message : candidate))
			: [...messages, message];
	return next.sort(compareAgentMessages);
}

function agentMessageKey(message: AgentMessage): string {
	const id = readStringProperty(message, "id") ?? readStringProperty(message, "messageId");
	if (id) return `id:${id}`;
	const timestamp = readNumberProperty(message, "timestamp");
	if (timestamp !== null) return `${message.role}:${timestamp}`;
	return `${message.role}:${JSON.stringify(message)}`;
}

function compareAgentMessages(left: AgentMessage, right: AgentMessage): number {
	const leftTimestamp = readNumberProperty(left, "timestamp");
	const rightTimestamp = readNumberProperty(right, "timestamp");
	if (leftTimestamp !== null && rightTimestamp !== null && leftTimestamp !== rightTimestamp) {
		return leftTimestamp - rightTimestamp;
	}
	if (leftTimestamp !== null && rightTimestamp === null) return -1;
	if (leftTimestamp === null && rightTimestamp !== null) return 1;
	return 0;
}

function readStringProperty(message: AgentMessage, key: string): string | null {
	const value = (message as unknown as Record<string, unknown>)[key];
	return typeof value === "string" && value.trim() ? value : null;
}

function readNumberProperty(message: AgentMessage, key: string): number | null {
	const value = (message as unknown as Record<string, unknown>)[key];
	return typeof value === "number" ? value : null;
}
