import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
	type AgentSession,
	type AgentSessionEvent,
	type AuthStorage,
	createAgentSession,
	type ModelRegistry,
	SessionManager,
	type SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { DashboardThreadState } from "../transport/types.js";
import type { SubAgentEvent, SubAgentState } from "../types.js";
import { formatDashboardCommands, type ThreadPromptImage, type ThreadPromptMode } from "./session-control.js";

export interface StandaloneSessionInfo {
	instanceId: string;
	sessionId: string;
	session: AgentSession;
	name: string;
	createdAt: number;
	state: DashboardThreadState;
	unsubscribe: () => void;
}

export interface CreateStandaloneSessionInput {
	name?: string;
	cwd: string;
}

export class StandaloneSessionManager {
	private sessions = new Map<string, StandaloneSessionInfo>();

	constructor(
		private cwd: string,
		private modelRegistry: ModelRegistry,
		private settingsManager: SettingsManager,
		private authStorage?: AuthStorage,
		private emit?: (event: SubAgentEvent) => void,
	) {}

	async create(input: CreateStandaloneSessionInput): Promise<StandaloneSessionInfo> {
		const instanceId = `standalone-${randomUUID()}`;
		const sessionManager = SessionManager.create(input.cwd ?? this.cwd);
		const { session } = await createAgentSession({
			cwd: input.cwd ?? this.cwd,
			sessionManager,
			modelRegistry: this.modelRegistry,
			settingsManager: this.settingsManager,
			authStorage: this.authStorage,
		});

		const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
			this.handleSessionEvent(instanceId, event);
		});

		const name = input.name ?? `Session ${instanceId.slice(-8)}`;
		const provisional: StandaloneSessionInfo = {
			instanceId,
			sessionId: session.sessionId,
			session,
			name,
			createdAt: Date.now(),
			state: null as unknown as DashboardThreadState,
			unsubscribe,
		};
		provisional.state = this.buildState(provisional, "paused");
		const info = provisional;

		this.sessions.set(instanceId, info);

		this.emit?.({
			type: "instance.created",
			instanceId,
			taskId: instanceId,
			definitionName: "standalone",
			timestamp: Date.now(),
		});

		this.emit?.({
			type: "instance.state",
			instanceId,
			taskId: instanceId,
			state: info.state,
			timestamp: Date.now(),
		});

		return info;
	}

	get(instanceId: string): StandaloneSessionInfo | undefined {
		return this.sessions.get(instanceId);
	}

	getBySessionId(sessionId: string): StandaloneSessionInfo | undefined {
		for (const info of this.sessions.values()) {
			if (info.sessionId === sessionId) return info;
		}
		return undefined;
	}

	list(): StandaloneSessionInfo[] {
		return Array.from(this.sessions.values());
	}

	async prompt(
		instanceId: string,
		message: string,
		mode: ThreadPromptMode,
		images?: ThreadPromptImage[],
	): Promise<void> {
		const info = this.sessions.get(instanceId);
		if (!info) throw new Error(`Standalone session "${instanceId}" not found`);

		this.emitState(info, "running");
		try {
			if (mode === "follow_up") {
				await info.session.followUp(message, images);
			} else if (mode === "steer") {
				await info.session.steer(message, images);
			} else {
				await info.session.prompt(message, { images });
			}
		} finally {
			this.emitState(info, info.session.isStreaming ? "running" : "paused");
		}
	}

	async abort(instanceId: string): Promise<void> {
		const info = this.sessions.get(instanceId);
		if (!info) throw new Error(`Standalone session "${instanceId}" not found`);
		await info.session.abort();
		this.emitState(info, "paused");
	}

	getMessages(instanceId: string): AgentMessage[] {
		const info = this.sessions.get(instanceId);
		if (!info) throw new Error(`Standalone session "${instanceId}" not found`);
		return info.session.messages;
	}

	getCommands(instanceId: string): ReturnType<typeof formatDashboardCommands> {
		const info = this.sessions.get(instanceId);
		if (!info) throw new Error(`Standalone session "${instanceId}" not found`);
		return formatDashboardCommands([
			...info.session.extensionRunner.getRegisteredCommands().map((command) => ({
				name: command.invocationName,
				description: command.description,
				source: "extension" as const,
				sourceInfo: command.sourceInfo,
			})),
			...info.session.promptTemplates.map((template) => ({
				name: template.name,
				description: template.description,
				source: "prompt" as const,
				sourceInfo: template.sourceInfo,
			})),
			...info.session.resourceLoader.getSkills().skills.map((skill) => ({
				name: `skill:${skill.name}`,
				description: skill.description,
				source: "skill" as const,
				sourceInfo: skill.sourceInfo,
			})),
		]);
	}

	async getAvailableModels(instanceId: string): Promise<Model<Api>[]> {
		const info = this.sessions.get(instanceId);
		if (!info) throw new Error(`Standalone session "${instanceId}" not found`);
		return info.session.modelRegistry.getAvailable();
	}

	async setModel(instanceId: string, provider: string, modelId: string): Promise<Model<Api> | undefined> {
		const info = this.sessions.get(instanceId);
		if (!info) throw new Error(`Standalone session "${instanceId}" not found`);
		const model = info.session.modelRegistry.find(provider, modelId);
		if (!model) return undefined;
		await info.session.setModel(model);
		this.emitState(info, info.session.isStreaming ? "running" : "paused");
		return model;
	}

	dispose(instanceId: string): void {
		const info = this.sessions.get(instanceId);
		if (!info) return;
		info.unsubscribe();
		info.session.dispose();
		this.sessions.delete(instanceId);
	}

	private handleSessionEvent(instanceId: string, event: AgentSessionEvent): void {
		const info = this.sessions.get(instanceId);
		if (!info) return;

		this.emit?.({
			type: "session.event",
			instanceId,
			taskId: instanceId,
			sessionEvent: event as unknown as Record<string, unknown>,
			timestamp: Date.now(),
		});

		const state = this.inferState(info.session);
		this.emitState(info, state);
	}

	private inferState(session: AgentSession): SubAgentState {
		if (session.isStreaming) return "running";
		return "paused";
	}

	private emitState(info: StandaloneSessionInfo, state: SubAgentState): void {
		const next = this.buildState(info, state);
		info.state = next;
		this.emit?.({
			type: "instance.state",
			instanceId: info.instanceId,
			taskId: info.instanceId,
			state: next,
			timestamp: Date.now(),
		});
	}

	private buildState(info: StandaloneSessionInfo, state: SubAgentState): DashboardThreadState {
		const model = info.session.model;
		const cwd = info.session.sessionManager.getCwd();
		return {
			instanceId: info.instanceId,
			taskId: info.instanceId,
			definitionName: "standalone",
			cwd,
			description: info.name,
			state,
			startTime: info.createdAt,
			endTime: null,
			turnCount: 0,
			lastActivityAt: Date.now(),
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: Date.now() - info.createdAt,
			kind: "main",
			isLive: true,
			sessionId: info.sessionId,
			sessionFile: info.session.sessionFile,
			modelProvider: model?.provider,
			modelId: model?.id,
		};
	}
}
