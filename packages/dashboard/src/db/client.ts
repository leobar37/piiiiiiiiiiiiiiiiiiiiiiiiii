import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.js";

export type DashboardDb = BunSQLiteDatabase<typeof schema> & { $client: Database };

export interface DashboardDbHandle {
	db: DashboardDb;
	path: string;
	close(): void;
}

export function getDashboardDbPath(agentDir = join(homedir(), ".pi", "agent")): string {
	return join(agentDir, "dashboard.sqlite");
}

function migrateDashboardDb(sqlite: Database): void {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY NOT NULL,
			name TEXT NOT NULL,
			default_cwd TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			archived_at INTEGER
		);

		CREATE TABLE IF NOT EXISTS project_sessions (
			id TEXT PRIMARY KEY NOT NULL,
			project_id TEXT NOT NULL REFERENCES projects(id),
			session_file TEXT,
			cwd TEXT,
			title TEXT,
			kind TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			last_activity_at INTEGER NOT NULL
		);

		CREATE INDEX IF NOT EXISTS project_sessions_project_id_idx
			ON project_sessions(project_id);

		CREATE INDEX IF NOT EXISTS project_sessions_last_activity_at_idx
			ON project_sessions(last_activity_at);
	`);
}

export function createDashboardDb(path = getDashboardDbPath()): DashboardDbHandle {
	mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path, { create: true, readwrite: true });
	sqlite.exec("PRAGMA journal_mode = WAL;");
	sqlite.exec("PRAGMA foreign_keys = ON;");
	migrateDashboardDb(sqlite);
	const db = drizzle(sqlite, { schema });
	return {
		db,
		path,
		close() {
			sqlite.close();
		},
	};
}
