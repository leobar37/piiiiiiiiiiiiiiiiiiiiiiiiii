import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	defaultCwd: text("default_cwd"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	archivedAt: integer("archived_at"),
});

export const projectSessions = sqliteTable("project_sessions", {
	id: text("id").primaryKey(),
	projectId: text("project_id")
		.notNull()
		.references(() => projects.id),
	sessionFile: text("session_file"),
	cwd: text("cwd"),
	title: text("title"),
	kind: text("kind", { enum: ["agent", "lion"] }).notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	lastActivityAt: integer("last_activity_at").notNull(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type ProjectSessionRow = typeof projectSessions.$inferSelect;
export type NewProjectSessionRow = typeof projectSessions.$inferInsert;
