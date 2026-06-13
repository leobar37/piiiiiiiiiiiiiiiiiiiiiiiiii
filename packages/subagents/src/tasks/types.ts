export const TODO_DIR_NAME = ".pi/todos";
export const TODO_PATH_ENV = "PI_TODO_PATH";
export const TODO_ID_PREFIX = "TASK-";
export const LEGACY_TODO_ID_PREFIX = "TODO-";
export const TASK_ID_PATTERN = /^[a-f0-9]{8}$/i;
export const TASK_EVENTS_FILE = "events.jsonl";
export const TASK_SNAPSHOT_FILE = "snapshot.json";
export const TASK_LOCK_FILE = "store.lock";
export const TASK_SCHEMA_VERSION = 1;
export const LOCK_TTL_MS = 30 * 60 * 1000;

export const TASK_STATUSES = ["pending", "in_progress", "blocked", "completed", "deleted"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskContext {
	why?: string;
	files?: string[];
	doneWhen?: string[];
	notes?: string;
}

export interface TaskRecord {
	id: string;
	title: string;
	status: TaskStatus;
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
	revision: number;
	assignedToSession?: string;
	context?: TaskContext;
}

export interface TaskSnapshot {
	version: typeof TASK_SCHEMA_VERSION;
	tasks: TaskRecord[];
	updatedAt: string;
}

export type TaskEventType =
	| "task.created"
	| "task.updated"
	| "task.completed"
	| "task.blocked"
	| "task.deleted"
	| "task.snapshot_rebuilt";

export interface TaskEvent {
	type: TaskEventType;
	taskId?: string;
	task?: TaskRecord;
	patch?: TaskPatch;
	revision?: number;
	sessionId?: string;
	timestamp: string;
}

export interface TaskChangeEvent {
	type: "task.changed";
	action: "created" | "updated" | "completed" | "blocked" | "deleted";
	taskId: string;
	task: TaskRecord;
	timestamp: number;
	instanceId?: undefined;
}

export interface TaskPatch {
	title?: string;
	status?: TaskStatus;
	assignedToSession?: string | null;
	context?: TaskContext;
}

export interface CreateTaskInput {
	title: string;
	status?: TaskStatus;
	context?: TaskContext;
	assignedToSession?: string;
}

export interface UpdateTaskInput extends TaskPatch {
	id: string;
	expectedRevision?: number;
}

export interface TaskStoreError {
	code:
		| "invalid_id"
		| "not_found"
		| "invalid_status"
		| "invalid_context"
		| "revision_conflict"
		| "active_task_conflict"
		| "lock_failed"
		| "storage_error";
	message: string;
}

export type TaskStoreResult<T> = T | { error: TaskStoreError };

export interface LockInfo {
	pid: number;
	session?: string | null;
	createdAt: string;
}
