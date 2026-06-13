import type { LiveSessionInfo } from "../session/types.js";

export interface ProjectInfo {
	id: string;
	name: string;
	defaultCwd?: string;
	createdAt: number;
	updatedAt: number;
	archivedAt?: number;
	sessionCount: number;
	lastActivityAt?: number;
}

export interface ProjectSessionInfo extends LiveSessionInfo {
	projectId: string;
}

export interface CreateProjectInput {
	name?: string;
	defaultCwd?: string;
}
