import { basename } from "node:path";
import type { ProjectsRepository } from "../db/repositories/projects-repository.js";
import type { SessionsRepository } from "../db/repositories/sessions-repository.js";
import type { ProjectSessionRow } from "../db/schema.js";
import type { SessionHost } from "../session/host.js";
import type { LiveSessionInfo } from "../session/types.js";
import type { CreateProjectInput, ProjectInfo, ProjectSessionInfo } from "./types.js";

const IMPORTED_PROJECT_ID = "imported-sessions";
const IMPORTED_PROJECT_NAME = "Imported Sessions";
const IMPORT_EXISTING_SESSIONS_INTERVAL_MS = 30000;

function projectNameFromCwd(cwd: string | undefined): string {
	if (!cwd) return "Untitled Project";
	const name = basename(cwd);
	return name.trim() || cwd;
}

function projectSessionFromRow(row: ProjectSessionRow): ProjectSessionInfo {
	return {
		id: row.id,
		projectId: row.projectId,
		name: row.title ?? undefined,
		status: "stopped",
		isActive: false,
		sessionFile: row.sessionFile ?? undefined,
		cwd: row.cwd ?? "",
		createdAt: row.createdAt,
		lastActivityAt: row.lastActivityAt,
		messageCount: 0,
		sessionType: row.kind,
	};
}

function mergeProjectSession(row: ProjectSessionRow, live: LiveSessionInfo | undefined): ProjectSessionInfo {
	if (!live) return projectSessionFromRow(row);
	return {
		...live,
		projectId: row.projectId,
		name: live.name ?? row.title ?? undefined,
		sessionFile: live.sessionFile ?? row.sessionFile ?? undefined,
		cwd: live.cwd || row.cwd || "",
		sessionType: live.sessionType ?? row.kind,
	};
}

export class ProjectService {
	private importExistingSessionsPromise: Promise<void> | null = null;
	private lastImportExistingSessionsAt = 0;

	constructor(
		private readonly projects: ProjectsRepository,
		private readonly sessions: SessionsRepository,
		private readonly sessionHost: SessionHost,
	) {}

	async listProjects(): Promise<ProjectInfo[]> {
		await this.importExistingSessions();
		const [projects, sessions] = await Promise.all([this.projects.list(), this.sessions.list()]);
		const counts = new Map<string, number>();
		const lastActivity = new Map<string, number>();
		for (const session of sessions) {
			counts.set(session.projectId, (counts.get(session.projectId) ?? 0) + 1);
			const current = lastActivity.get(session.projectId) ?? 0;
			if (session.lastActivityAt > current) {
				lastActivity.set(session.projectId, session.lastActivityAt);
			}
		}
		return projects.map((project) => ({
			id: project.id,
			name: project.name,
			defaultCwd: project.defaultCwd ?? undefined,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			archivedAt: project.archivedAt ?? undefined,
			sessionCount: counts.get(project.id) ?? 0,
			lastActivityAt: lastActivity.get(project.id),
		}));
	}

	async createProject(input: CreateProjectInput): Promise<ProjectInfo> {
		const name = input.name?.trim() || projectNameFromCwd(input.defaultCwd);
		const project = await this.projects.create({
			name,
			defaultCwd: input.defaultCwd,
		});
		return {
			id: project.id,
			name: project.name,
			defaultCwd: project.defaultCwd ?? undefined,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			archivedAt: project.archivedAt ?? undefined,
			sessionCount: 0,
		};
	}

	async updateProject(
		projectId: string,
		input: {
			name?: string;
			defaultCwd?: string | null;
		},
	): Promise<ProjectInfo> {
		const project = await this.projects.update(projectId, input);
		const sessions = await this.sessions.list(project.id);
		return {
			id: project.id,
			name: project.name,
			defaultCwd: project.defaultCwd ?? undefined,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			archivedAt: project.archivedAt ?? undefined,
			sessionCount: sessions.length,
			lastActivityAt: sessions[0]?.lastActivityAt,
		};
	}

	async archiveProject(projectId: string): Promise<boolean> {
		return this.projects.archive(projectId);
	}

	async createSession(projectId: string, cwd?: string): Promise<ProjectSessionInfo> {
		const project = await this.projects.get(projectId);
		if (!project || project.archivedAt) {
			throw new Error(`Project ${projectId} not found`);
		}
		const session = await this.sessionHost.create(cwd ?? project.defaultCwd ?? undefined);
		await this.sessions.createFromLiveInfo(project.id, session.info);
		return { ...session.info, projectId: project.id };
	}

	async listSessions(projectId?: string): Promise<ProjectSessionInfo[]> {
		await this.importExistingSessions();
		const [rows, liveSessions] = await Promise.all([this.sessions.list(projectId), this.sessionHost.listAll()]);
		const liveById = new Map(liveSessions.map((session) => [session.id, session]));
		const result = rows.map((row) => mergeProjectSession(row, liveById.get(row.id)));
		for (const session of result) {
			await this.sessions.updateFromLiveInfo(session);
		}
		return result;
	}

	async moveSession(sessionId: string, projectId: string): Promise<ProjectSessionInfo> {
		const project = await this.projects.get(projectId);
		if (!project || project.archivedAt) {
			throw new Error(`Project ${projectId} not found`);
		}
		const moved = await this.sessions.move(sessionId, projectId);
		const live = await this.sessionHost.resolve(sessionId);
		return mergeProjectSession(moved, live?.info);
	}

	async removeSession(sessionId: string): Promise<void> {
		await this.sessions.remove(sessionId);
	}

	private async importExistingSessions(): Promise<void> {
		const now = Date.now();
		if (this.importExistingSessionsPromise) {
			return this.importExistingSessionsPromise;
		}
		if (now - this.lastImportExistingSessionsAt < IMPORT_EXISTING_SESSIONS_INTERVAL_MS) {
			return;
		}
		this.importExistingSessionsPromise = this.importExistingSessionsNow();
		try {
			await this.importExistingSessionsPromise;
			this.lastImportExistingSessionsAt = Date.now();
		} finally {
			this.importExistingSessionsPromise = null;
		}
	}

	private async importExistingSessionsNow(): Promise<void> {
		const existingSessions = await this.sessionHost.listAll();
		const uncataloged: LiveSessionInfo[] = [];
		for (const session of existingSessions) {
			const row = await this.sessions.get(session.id);
			if (row) {
				await this.sessions.updateFromLiveInfo(session);
			} else {
				uncataloged.push(session);
			}
		}
		if (uncataloged.length === 0) return;

		let importedProject = await this.projects.get(IMPORTED_PROJECT_ID);
		if (!importedProject) {
			importedProject = await this.projects.create({
				id: IMPORTED_PROJECT_ID,
				name: IMPORTED_PROJECT_NAME,
			});
		}

		for (const session of uncataloged) {
			await this.sessions.upsertFromLiveInfo(importedProject.id, session);
		}
	}
}
