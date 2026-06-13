import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectsRepository } from "../src/db/repositories/projects-repository.js";
import type { SessionsRepository } from "../src/db/repositories/sessions-repository.js";
import type { ProjectRow, ProjectSessionRow } from "../src/db/schema.js";
import { ProjectService } from "../src/projects/service.js";
import type { SessionHost } from "../src/session/host.js";
import type { LiveSessionInfo } from "../src/session/types.js";

let tempDir: string;
let service: ProjectService;
let host: SessionHost;
let sessions: LiveSessionInfo[];

class InMemoryProjectsRepository {
	private readonly rows = new Map<string, ProjectRow>();
	private nextId = 1;

	async list(): Promise<ProjectRow[]> {
		return Array.from(this.rows.values()).filter((project) => project.archivedAt === null);
	}

	async get(id: string): Promise<ProjectRow | undefined> {
		return this.rows.get(id);
	}

	async create(input: { id?: string; name: string; defaultCwd?: string }): Promise<ProjectRow> {
		const now = Date.now();
		const row: ProjectRow = {
			id: input.id ?? `project-${this.nextId++}`,
			name: input.name,
			defaultCwd: input.defaultCwd ?? null,
			createdAt: now,
			updatedAt: now,
			archivedAt: null,
		};
		this.rows.set(row.id, row);
		return row;
	}

	async update(id: string, input: { name?: string; defaultCwd?: string | null }): Promise<ProjectRow> {
		const existing = this.rows.get(id);
		if (!existing) throw new Error(`Project ${id} not found`);
		const updated: ProjectRow = {
			...existing,
			name: input.name ?? existing.name,
			defaultCwd: input.defaultCwd === undefined ? existing.defaultCwd : input.defaultCwd,
			updatedAt: Date.now(),
		};
		this.rows.set(id, updated);
		return updated;
	}

	async archive(id: string): Promise<boolean> {
		const existing = this.rows.get(id);
		if (!existing) return false;
		this.rows.set(id, { ...existing, archivedAt: Date.now(), updatedAt: Date.now() });
		return true;
	}
}

class InMemorySessionsRepository {
	private readonly rows = new Map<string, ProjectSessionRow>();

	async list(projectId?: string): Promise<ProjectSessionRow[]> {
		const rows = Array.from(this.rows.values());
		return projectId ? rows.filter((session) => session.projectId === projectId) : rows;
	}

	async get(id: string): Promise<ProjectSessionRow | undefined> {
		return this.rows.get(id);
	}

	async createFromLiveInfo(projectId: string, info: LiveSessionInfo): Promise<ProjectSessionRow> {
		const row = this.rowFromLiveInfo(projectId, info);
		this.rows.set(row.id, row);
		return row;
	}

	async upsertFromLiveInfo(projectId: string, info: LiveSessionInfo): Promise<ProjectSessionRow> {
		const row = this.rowFromLiveInfo(projectId, info);
		this.rows.set(row.id, row);
		return row;
	}

	async updateFromLiveInfo(info: LiveSessionInfo): Promise<void> {
		const existing = this.rows.get(info.id);
		if (!existing) return;
		this.rows.set(info.id, {
			...existing,
			sessionFile: info.sessionFile ?? existing.sessionFile,
			cwd: info.cwd || existing.cwd,
			title: info.name ?? existing.title,
			kind: info.sessionType ?? existing.kind,
			updatedAt: Date.now(),
			lastActivityAt: info.lastActivityAt,
		});
	}

	async move(sessionId: string, projectId: string): Promise<ProjectSessionRow> {
		const existing = this.rows.get(sessionId);
		if (!existing) throw new Error(`Session ${sessionId} not found`);
		const moved = { ...existing, projectId, updatedAt: Date.now() };
		this.rows.set(sessionId, moved);
		return moved;
	}

	async remove(sessionId: string): Promise<void> {
		this.rows.delete(sessionId);
	}

	private rowFromLiveInfo(projectId: string, info: LiveSessionInfo): ProjectSessionRow {
		return {
			id: info.id,
			projectId,
			sessionFile: info.sessionFile ?? null,
			cwd: info.cwd || null,
			title: info.name ?? null,
			kind: info.sessionType ?? "agent",
			createdAt: info.createdAt,
			updatedAt: Date.now(),
			lastActivityAt: info.lastActivityAt,
		};
	}
}

function createHostStub(defaultCwd: string): SessionHost {
	return {
		async create(cwd?: string) {
			const now = Date.now();
			const info: LiveSessionInfo = {
				id: `session-${sessions.length + 1}`,
				status: "created",
				isActive: false,
				sessionFile: join(tempDir, "sessions", `session-${sessions.length + 1}.jsonl`),
				cwd: cwd ?? defaultCwd,
				createdAt: now,
				lastActivityAt: now,
				messageCount: 0,
				sessionType: "agent",
			};
			sessions.push(info);
			return { id: info.id, info };
		},
		async listAll() {
			return sessions;
		},
		async resolve(sessionId: string) {
			const info = sessions.find((session) => session.id === sessionId);
			return info ? { id: info.id, info } : undefined;
		},
	} as unknown as SessionHost;
}

function createService(): void {
	const sessionsDir = join(tempDir, "sessions");
	mkdirSync(sessionsDir, { recursive: true });
	sessions = [];
	host = createHostStub(tempDir);
	service = new ProjectService(
		new InMemoryProjectsRepository() as unknown as ProjectsRepository,
		new InMemorySessionsRepository() as unknown as SessionsRepository,
		host,
	);
}

beforeEach(() => {
	tempDir = join(tmpdir(), `pi-dashboard-project-service-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });
	createService();
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe("ProjectService", () => {
	it("creates sessions under explicit projects and filters by project", async () => {
		const firstCwd = join(tempDir, "first-project");
		const secondCwd = join(tempDir, "second-project");
		mkdirSync(firstCwd, { recursive: true });
		mkdirSync(secondCwd, { recursive: true });

		const firstProject = await service.createProject({ defaultCwd: firstCwd });
		const secondProject = await service.createProject({ defaultCwd: secondCwd });

		const firstSession = await service.createSession(firstProject.id);
		const secondSession = await service.createSession(secondProject.id);

		expect(firstSession.projectId).toBe(firstProject.id);
		expect(firstSession.cwd).toBe(firstCwd);
		expect(secondSession.projectId).toBe(secondProject.id);
		expect(secondSession.cwd).toBe(secondCwd);

		const firstSessions = await service.listSessions(firstProject.id);
		expect(firstSessions.map((session) => session.id)).toEqual([firstSession.id]);

		const globalSessions = await service.listSessions();
		expect(globalSessions.map((session) => session.id).sort()).toEqual([firstSession.id, secondSession.id].sort());
	});

	it("imports existing sessions into an explicit imported project instead of deriving projects from cwd", async () => {
		const existingCwd = join(tempDir, "cwd-is-not-project");
		mkdirSync(existingCwd, { recursive: true });
		const existingSession = await host.create(existingCwd);

		const projects = await service.listProjects();
		const importedProject = projects.find((project) => project.id === "imported-sessions");

		expect(importedProject).toBeDefined();
		expect(importedProject?.name).toBe("Imported Sessions");
		expect(importedProject?.defaultCwd).toBeUndefined();

		const importedSessions = await service.listSessions(importedProject!.id);
		expect(importedSessions).toHaveLength(1);
		expect(importedSessions[0].id).toBe(existingSession.id);
		expect(importedSessions[0].projectId).toBe("imported-sessions");
		expect(importedSessions[0].cwd).toBe(existingCwd);
	});
});
