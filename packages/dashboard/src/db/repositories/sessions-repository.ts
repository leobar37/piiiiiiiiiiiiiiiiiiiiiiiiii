import { desc, eq } from "drizzle-orm";
import type { LiveSessionInfo } from "../../session/types.js";
import type { DashboardDb } from "../client.js";
import { type NewProjectSessionRow, type ProjectSessionRow, projectSessions } from "../schema.js";

export class SessionsRepository {
	constructor(private readonly db: DashboardDb) {}

	async list(projectId?: string): Promise<ProjectSessionRow[]> {
		const query = this.db.select().from(projectSessions);
		if (projectId) {
			return query.where(eq(projectSessions.projectId, projectId)).orderBy(desc(projectSessions.lastActivityAt));
		}
		return query.orderBy(desc(projectSessions.lastActivityAt));
	}

	async get(id: string): Promise<ProjectSessionRow | undefined> {
		const rows = await this.db.select().from(projectSessions).where(eq(projectSessions.id, id)).limit(1);
		return rows[0];
	}

	async createFromLiveInfo(projectId: string, info: LiveSessionInfo): Promise<ProjectSessionRow> {
		const now = Date.now();
		const row: NewProjectSessionRow = {
			id: info.id,
			projectId,
			sessionFile: info.sessionFile ?? null,
			cwd: info.cwd || null,
			title: info.name ?? null,
			kind: info.sessionType ?? "agent",
			createdAt: info.createdAt,
			updatedAt: now,
			lastActivityAt: info.lastActivityAt,
		};
		await this.db.insert(projectSessions).values(row);
		const created = await this.get(info.id);
		if (!created) {
			throw new Error(`Session ${info.id} was not created`);
		}
		return created;
	}

	async upsertFromLiveInfo(projectId: string, info: LiveSessionInfo): Promise<ProjectSessionRow> {
		const existing = await this.get(info.id);
		if (!existing) {
			return this.createFromLiveInfo(projectId, info);
		}
		const now = Date.now();
		await this.db
			.update(projectSessions)
			.set({
				projectId,
				sessionFile: info.sessionFile ?? existing.sessionFile,
				cwd: info.cwd || existing.cwd,
				title: info.name ?? existing.title,
				kind: info.sessionType ?? existing.kind,
				updatedAt: now,
				lastActivityAt: info.lastActivityAt,
			})
			.where(eq(projectSessions.id, info.id));
		const updated = await this.get(info.id);
		if (!updated) {
			throw new Error(`Session ${info.id} not found after update`);
		}
		return updated;
	}

	async updateFromLiveInfo(info: LiveSessionInfo): Promise<void> {
		const existing = await this.get(info.id);
		if (!existing) return;
		await this.db
			.update(projectSessions)
			.set({
				sessionFile: info.sessionFile ?? existing.sessionFile,
				cwd: info.cwd || existing.cwd,
				title: info.name ?? existing.title,
				kind: info.sessionType ?? existing.kind,
				updatedAt: Date.now(),
				lastActivityAt: info.lastActivityAt,
			})
			.where(eq(projectSessions.id, info.id));
	}

	async move(sessionId: string, projectId: string): Promise<ProjectSessionRow> {
		await this.db
			.update(projectSessions)
			.set({ projectId, updatedAt: Date.now() })
			.where(eq(projectSessions.id, sessionId));
		const moved = await this.get(sessionId);
		if (!moved) {
			throw new Error(`Session ${sessionId} not found`);
		}
		return moved;
	}

	async remove(sessionId: string): Promise<void> {
		await this.db.delete(projectSessions).where(eq(projectSessions.id, sessionId));
	}
}
