import { StringEnum } from "@earendil-works/pi-ai";
import type { Keybinding } from "@earendil-works/pi-tui";
import type {
	CreateTaskInput,
	LockInfo,
	TaskChangeEvent,
	TaskContext,
	TaskEvent,
	TaskEventType,
	TaskPatch,
	TaskRecord,
	TaskSnapshot,
	TaskStatus,
	TaskStoreError,
	TaskStoreResult,
	UpdateTaskInput,
} from "@local/pi-subagents";
import { TASK_STATUSES } from "@local/pi-subagents";
import { Type } from "typebox";

export type {
	CreateTaskInput,
	LockInfo,
	TaskChangeEvent,
	TaskContext,
	TaskEvent,
	TaskEventType,
	TaskPatch,
	TaskRecord,
	TaskSnapshot,
	TaskStatus,
	TaskStoreError,
	TaskStoreResult,
	UpdateTaskInput,
};
export { TASK_STATUSES };

export type KeybindingMatcher = {
	matches: (keyData: string, keybindingId: Keybinding) => boolean;
};

export type TodoOverlayAction = "back" | "work";

export type TodoMenuAction =
	| "work"
	| "refine"
	| "close"
	| "reopen"
	| "block"
	| "release"
	| "delete"
	| "copyPath"
	| "copyText"
	| "view";

export type TaskToolDetails =
	| { action: "list"; tasks?: TaskRecord[]; currentSessionId?: string; error?: TaskStoreError }
	| {
			action: "get" | "create" | "update" | "complete" | "block" | "delete";
			task?: TaskRecord;
			error?: TaskStoreError;
	  };

export const TaskContextParams = Type.Object({
	why: Type.Optional(Type.String({ description: "One short line explaining why this task matters" })),
	files: Type.Optional(Type.Array(Type.String({ description: "Known relevant file or directory" }))),
	doneWhen: Type.Optional(Type.Array(Type.String({ description: "Short completion criterion" }))),
	notes: Type.Optional(Type.String({ description: "Short operational note, not a long plan" })),
});

export const TaskCreateParams = Type.Object({
	title: Type.String({ description: "Short task summary" }),
	status: Type.Optional(StringEnum(TASK_STATUSES, { description: "Initial task status", default: "pending" })),
	context: Type.Optional(TaskContextParams),
});

export const TaskIdParams = Type.Object({
	id: Type.String({ description: "Task id (TASK-<hex>, TODO-<hex>, or raw hex)" }),
});

export const TaskListParams = Type.Object({
	includeDeleted: Type.Optional(Type.Boolean({ description: "Include soft-deleted tasks", default: false })),
});

export const TaskUpdateParams = Type.Object({
	id: Type.String({ description: "Task id (TASK-<hex>, TODO-<hex>, or raw hex)" }),
	title: Type.Optional(Type.String({ description: "New task title" })),
	status: Type.Optional(StringEnum(TASK_STATUSES, { description: "New task status" })),
	context: Type.Optional(TaskContextParams),
	expectedRevision: Type.Optional(Type.Number({ description: "Expected current revision for optimistic updates" })),
});

export const TaskBlockParams = Type.Object({
	id: Type.String({ description: "Task id (TASK-<hex>, TODO-<hex>, or raw hex)" }),
	reason: Type.String({ description: "Concrete reason this task is blocked" }),
	expectedRevision: Type.Optional(Type.Number({ description: "Expected current revision for optimistic updates" })),
});

export const LegacyTodoParams = Type.Object({
	action: StringEnum(["list", "list-all", "get", "create", "update", "append", "delete", "claim", "release"] as const),
	id: Type.Optional(Type.String({ description: "Task id (TASK-<hex>, TODO-<hex>, or raw hex)" })),
	title: Type.Optional(Type.String({ description: "Short summary shown in lists" })),
	status: Type.Optional(Type.String({ description: "Task status" })),
	tags: Type.Optional(Type.Array(Type.String({ description: "Legacy tag; appended to notes during migration" }))),
	body: Type.Optional(Type.String({ description: "Long-form task notes" })),
	force: Type.Optional(Type.Boolean({ description: "Override another session assignment" })),
});

export type LegacyTodoAction =
	| "list"
	| "list-all"
	| "get"
	| "create"
	| "update"
	| "append"
	| "delete"
	| "claim"
	| "release";
