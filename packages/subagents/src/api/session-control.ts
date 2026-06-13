import { join } from "node:path";
import type { Api, ImageContent, Model } from "@earendil-works/pi-ai";
import {
	type AgentSession,
	type AgentSessionEvent,
	createAgentSession,
	SessionManager,
	type SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import type { SubAgentEvent, SubAgentRunRecord } from "../types.js";

export interface DashboardCommand {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
}

export interface DashboardModel {
	provider: string;
	id: string;
	name: string;
	api: string;
	reasoning: boolean;
}

export type ThreadPromptMode = "prompt" | "follow_up" | "steer";
export type ThreadPromptImage = ImageContent & { name?: string };

export interface CachedThreadSession {
	session: AgentSession;
	instanceId: string;
	taskId: string;
	dispose(): void;
}

export function formatDashboardCommands(commands: readonly SlashCommandInfo[]): DashboardCommand[] {
	return commands.map((command) => ({
		name: command.name,
		description: command.description,
		source: command.source,
	}));
}

export function formatDashboardModels(models: readonly Model<Api>[]): DashboardModel[] {
	return models.map((model) => ({
		provider: model.provider,
		id: model.id,
		name: model.name,
		api: model.api,
		reasoning: Boolean(model.reasoning),
	}));
}

export function getAgentSessionCommands(session: AgentSession): DashboardCommand[] {
	return formatDashboardCommands([
		...session.extensionRunner.getRegisteredCommands().map((command) => ({
			name: command.invocationName,
			description: command.description,
			source: "extension" as const,
			sourceInfo: command.sourceInfo,
		})),
		...session.promptTemplates.map((template) => ({
			name: template.name,
			description: template.description,
			source: "prompt" as const,
			sourceInfo: template.sourceInfo,
		})),
		...session.resourceLoader.getSkills().skills.map((skill) => ({
			name: `skill:${skill.name}`,
			description: skill.description,
			source: "skill" as const,
			sourceInfo: skill.sourceInfo,
		})),
	]);
}

export async function sendToAgentSession(
	session: AgentSession,
	message: string,
	mode: ThreadPromptMode,
	images?: ThreadPromptImage[],
): Promise<void> {
	if (mode === "follow_up") {
		await session.followUp(message, images);
		return;
	}
	if (mode === "steer") {
		await session.steer(message, images);
		return;
	}
	await session.prompt(message, { images });
}

export class DashboardThreadSessionCache {
	private sessions = new Map<string, CachedThreadSession>();

	constructor(private emit: (event: SubAgentEvent) => void) {}

	async getOrCreate(record: SubAgentRunRecord, sessionFile?: string): Promise<CachedThreadSession> {
		const existing = this.sessions.get(record.instanceId);
		if (existing) return existing;

		const sessionPath = sessionFile ?? join(record.cwd, ".pi", "sessions", `${record.sessionId}.json`);
		const sessionManager = SessionManager.open(sessionPath, undefined, record.cwd);
		const { session } = await createAgentSession({
			cwd: sessionManager.getCwd() || record.cwd,
			sessionManager,
		});

		const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
			this.emit({
				type: "session.event",
				instanceId: record.instanceId,
				taskId: record.taskId,
				sessionEvent: event as unknown as Record<string, unknown>,
				timestamp: Date.now(),
			});
		});

		const cached: CachedThreadSession = {
			session,
			instanceId: record.instanceId,
			taskId: record.taskId,
			dispose: () => {
				unsubscribe();
				session.dispose();
			},
		};
		this.sessions.set(record.instanceId, cached);
		return cached;
	}

	get(instanceId: string): CachedThreadSession | undefined {
		return this.sessions.get(instanceId);
	}

	disposeAll(): void {
		for (const session of this.sessions.values()) {
			session.dispose();
		}
		this.sessions.clear();
	}
}
