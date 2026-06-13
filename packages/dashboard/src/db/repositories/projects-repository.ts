import { randomUUID } from "node:crypto";
import { desc, eq, isNull } from "drizzle-orm";
import type { DashboardDb } from "../client.js";
import { type NewProjectRow, type ProjectRow, projects } from "../schema.js";

export interface CreateProjectInput {
	name: string;
	defaultCwd?: string;
	id?: string;
}

export interface UpdateProjectInput {
	name?: string;
	defaultCwd?: string | null;
}

export class ProjectsRepository {
	constructor(private readonly db: DashboardDb) {}

	async list(): Promise<ProjectRow[]> {
		return this.db.select().from(projects).where(isNull(projects.archivedAt)).orderBy(desc(projects.updatedAt));
	}

	async get(id: string): Promise<ProjectRow | undefined> {
		const rows = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
		return rows[0];
	}

	async create(input: CreateProjectInput): Promise<ProjectRow> {
		const now = Date.now();
		const row: NewProjectRow = {
			id: input.id ?? randomUUID(),
			name: input.name,
			defaultCwd: input.defaultCwd ?? null,
			createdAt: now,
			updatedAt: now,
			archivedAt: null,
		};
		await this.db.insert(projects).values(row);
		const created = await this.get(row.id);
		if (!created) {
			throw new Error(`Project ${row.id} was not created`);
		}
		return created;
	}

	async update(id: string, input: UpdateProjectInput): Promise<ProjectRow> {
		const patch: Partial<NewProjectRow> = { updatedAt: Date.now() };
		if (input.name !== undefined) patch.name = input.name;
		if (input.defaultCwd !== undefined) patch.defaultCwd = input.defaultCwd;
		await this.db.update(projects).set(patch).where(eq(projects.id, id));
		const updated = await this.get(id);
		if (!updated) {
			throw new Error(`Project ${id} not found`);
		}
		return updated;
	}

	async archive(id: string): Promise<boolean> {
		const existing = await this.get(id);
		if (!existing) return false;
		const now = Date.now();
		await this.db.update(projects).set({ archivedAt: now, updatedAt: now }).where(eq(projects.id, id));
		return true;
	}
}
