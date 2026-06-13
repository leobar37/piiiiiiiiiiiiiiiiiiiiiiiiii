import crypto from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
	type CreateTaskInput,
	LEGACY_TODO_ID_PREFIX,
	LOCK_TTL_MS,
	type LockInfo,
	TASK_EVENTS_FILE,
	TASK_ID_PATTERN,
	TASK_LOCK_FILE,
	TASK_SCHEMA_VERSION,
	TASK_SNAPSHOT_FILE,
	TASK_STATUSES,
	type TaskContext,
	type TaskEvent,
	type TaskPatch,
	type TaskRecord,
	type TaskSnapshot,
	type TaskStatus,
	type TaskStoreError,
	type TaskStoreResult,
	TODO_DIR_NAME,
	TODO_ID_PREFIX,
	TODO_PATH_ENV,
	type UpdateTaskInput,
} from "./types.js";

interface LegacyTodoFrontMatter {
	id?: string;
	title?: string;
	tags?: string[];
	status?: string;
	created_at?: string;
	assigned_to_session?: string;
}

interface LegacyTodoRecord {
	id: string;
	title: string;
	tags: string[];
	status: string;
	createdAt: string;
	assignedToSession?: string;
	body: string;
}

export function resolveTodosDir(cwd: string): string {
	const overridePath = process.env[TODO_PATH_ENV];
	if (overridePath?.trim()) {
		return path.resolve(cwd, overridePath.trim());
	}
	return path.resolve(cwd, TODO_DIR_NAME);
}

export function resolveTodosDirLabel(cwd: string): string {
	const overridePath = process.env[TODO_PATH_ENV];
	if (overridePath?.trim()) {
		return path.resolve(cwd, overridePath.trim());
	}
	return TODO_DIR_NAME;
}

export function normalizeTaskId(id: string): string {
	let trimmed = id.trim();
	if (trimmed.startsWith("#")) {
		trimmed = trimmed.slice(1);
	}
	const upper = trimmed.toUpperCase();
	if (upper.startsWith(TODO_ID_PREFIX)) {
		trimmed = trimmed.slice(TODO_ID_PREFIX.length);
	} else if (upper.startsWith(LEGACY_TODO_ID_PREFIX)) {
		trimmed = trimmed.slice(LEGACY_TODO_ID_PREFIX.length);
	}
	return trimmed;
}

export function formatTaskId(id: string): string {
	return `${TODO_ID_PREFIX}${normalizeTaskId(id)}`;
}

export function validateTaskId(id: string): { id: string } | { error: TaskStoreError } {
	const normalized = normalizeTaskId(id);
	if (!normalized || !TASK_ID_PATTERN.test(normalized)) {
		return { error: taskError("invalid_id", "Invalid task id. Expected TASK-<hex>.") };
	}
	return { id: normalized.toLowerCase() };
}

export function isTaskClosed(status: TaskStatus): boolean {
	return status === "completed" || status === "deleted";
}

export function toTaskStatus(status: string | undefined): TaskStatus {
	const normalized = (status ?? "").toLowerCase();
	if (normalized === "open" || normalized === "todo") return "pending";
	if (normalized === "done" || normalized === "closed" || normalized === "complete") return "completed";
	if (TASK_STATUSES.includes(normalized as TaskStatus)) return normalized as TaskStatus;
	return "pending";
}

export function taskError(code: TaskStoreError["code"], message: string): TaskStoreError {
	return { code, message };
}

export interface TaskListOptions {
	includeDeleted?: boolean;
}

export function isTaskStoreError<T>(result: TaskStoreResult<T>): result is { error: TaskStoreError } {
	return typeof result === "object" && result !== null && "error" in result;
}

export class TaskStore {
	constructor(readonly todosDir: string) {}

	async initialize(): Promise<void> {
		await this.ensureDir();
		const result = await this.withLock(null, async () => {
			const hasSnapshot = existsSync(this.snapshotPath);
			const hasEvents = existsSync(this.eventsPath);
			if (!hasSnapshot && !hasEvents) {
				const legacy = await this.readLegacyMarkdownTasks();
				if (legacy.length > 0) {
					const tasks = legacy.map((todo) => this.legacyToTask(todo));
					await this.writeInitialEvents(tasks);
					await this.writeSnapshot({ version: TASK_SCHEMA_VERSION, tasks, updatedAt: new Date().toISOString() });
					return;
				}
			}
			if (!hasSnapshot && hasEvents) {
				await this.rebuildSnapshot();
			}
		});
		if (typeof result === "object" && result !== null && "error" in result) {
			throw new Error(result.error.message);
		}
	}

	async list(options: TaskListOptions = {}): Promise<TaskRecord[]> {
		const snapshot = await this.readSnapshot();
		const tasks = options.includeDeleted
			? snapshot.tasks
			: snapshot.tasks.filter((task) => task.status !== "deleted");
		return sortTasks(tasks);
	}

	async get(id: string): Promise<TaskRecord | null> {
		const validated = validateTaskId(id);
		if ("error" in validated) return null;
		const snapshot = await this.readSnapshot();
		return snapshot.tasks.find((task) => task.id === validated.id) ?? null;
	}

	async create(input: CreateTaskInput, sessionId?: string | null): Promise<TaskStoreResult<TaskRecord>> {
		const title = input.title.trim();
		if (!title) return { error: taskError("storage_error", "Task title is required.") };
		const context = normalizeContext(input.context);
		if ("error" in context) return context;
		const status = input.status ?? "pending";
		if (!TASK_STATUSES.includes(status))
			return { error: taskError("invalid_status", `Invalid task status: ${status}`) };

		return this.withLock(sessionId, async () => {
			const snapshot = await this.readSnapshot();
			if (status === "in_progress" && input.assignedToSession) {
				const conflict = findActiveTask(snapshot.tasks, input.assignedToSession);
				if (conflict) {
					return {
						error: taskError(
							"active_task_conflict",
							`Session ${input.assignedToSession} already has active task ${formatTaskId(conflict.id)}.`,
						),
					};
				}
			}
			const id = await this.generateId(snapshot.tasks);
			const now = new Date().toISOString();
			const task: TaskRecord = {
				id,
				title,
				status,
				createdAt: now,
				updatedAt: now,
				completedAt: status === "completed" ? now : undefined,
				revision: 1,
				assignedToSession: input.assignedToSession,
				context: context.context,
			};
			const tasks = sortTasks([...snapshot.tasks, task]);
			await this.appendEvent({
				type: "task.created",
				taskId: id,
				task,
				revision: task.revision,
				sessionId: sessionId ?? undefined,
				timestamp: now,
			});
			await this.writeSnapshot({ version: TASK_SCHEMA_VERSION, tasks, updatedAt: now });
			return task;
		});
	}

	async update(input: UpdateTaskInput, sessionId?: string | null): Promise<TaskStoreResult<TaskRecord>> {
		const validated = validateTaskId(input.id);
		if ("error" in validated) return { error: validated.error };
		const context = input.context === undefined ? undefined : normalizeContext(input.context);
		if (context && "error" in context) return context;
		if (input.status && !TASK_STATUSES.includes(input.status)) {
			return { error: taskError("invalid_status", `Invalid task status: ${input.status}`) };
		}

		return this.withLock(sessionId, async () => {
			const snapshot = await this.readSnapshot();
			const index = snapshot.tasks.findIndex((task) => task.id === validated.id);
			if (index === -1) return { error: taskError("not_found", `Task ${formatTaskId(validated.id)} not found.`) };
			const existing = snapshot.tasks[index];
			if (input.expectedRevision !== undefined && existing.revision !== input.expectedRevision) {
				return {
					error: taskError(
						"revision_conflict",
						`Task ${formatTaskId(existing.id)} revision is ${existing.revision}, expected ${input.expectedRevision}.`,
					),
				};
			}
			const patch: TaskPatch = {};
			if (input.title !== undefined) {
				const title = input.title.trim();
				if (!title) return { error: taskError("storage_error", "Task title cannot be empty.") };
				patch.title = title;
			}
			if (input.status !== undefined) patch.status = input.status;
			if (input.assignedToSession !== undefined) patch.assignedToSession = input.assignedToSession;
			if (context !== undefined) patch.context = context.context;

			const updated = applyPatch(existing, patch);
			if (updated.status === "in_progress" && updated.assignedToSession) {
				const conflict = findActiveTask(snapshot.tasks, updated.assignedToSession, updated.id);
				if (conflict) {
					return {
						error: taskError(
							"active_task_conflict",
							`Session ${updated.assignedToSession} already has active task ${formatTaskId(conflict.id)}.`,
						),
					};
				}
			}
			const now = new Date().toISOString();
			updated.updatedAt = now;
			updated.revision = existing.revision + 1;
			if (updated.status === "completed" && !updated.completedAt) updated.completedAt = now;
			if (updated.status !== "completed") updated.completedAt = undefined;
			if (isTaskClosed(updated.status)) updated.assignedToSession = undefined;

			const tasks = [...snapshot.tasks];
			tasks[index] = updated;
			const eventType =
				updated.status === "completed"
					? "task.completed"
					: updated.status === "blocked"
						? "task.blocked"
						: updated.status === "deleted"
							? "task.deleted"
							: "task.updated";
			await this.appendEvent({
				type: eventType,
				taskId: updated.id,
				task: updated,
				patch,
				revision: updated.revision,
				sessionId: sessionId ?? undefined,
				timestamp: now,
			});
			await this.writeSnapshot({ version: TASK_SCHEMA_VERSION, tasks: sortTasks(tasks), updatedAt: now });
			return updated;
		});
	}

	async block(
		id: string,
		reason: string,
		expectedRevision?: number,
		sessionId?: string | null,
	): Promise<TaskStoreResult<TaskRecord>> {
		const trimmed = reason.trim();
		if (!trimmed) return { error: taskError("storage_error", "Block reason is required.") };
		const existing = await this.get(id);
		const notes = existing?.context?.notes ? `${existing.context.notes}\nBlocked: ${trimmed}` : `Blocked: ${trimmed}`;
		return this.update(
			{
				id,
				status: "blocked",
				expectedRevision,
				context: {
					...existing?.context,
					notes,
				},
			},
			sessionId,
		);
	}

	async complete(
		id: string,
		expectedRevision?: number,
		sessionId?: string | null,
	): Promise<TaskStoreResult<TaskRecord>> {
		return this.update({ id, status: "completed", expectedRevision }, sessionId);
	}

	async softDelete(
		id: string,
		expectedRevision?: number,
		sessionId?: string | null,
	): Promise<TaskStoreResult<TaskRecord>> {
		return this.update({ id, status: "deleted", expectedRevision }, sessionId);
	}

	async claim(id: string, sessionId: string, force = false): Promise<TaskStoreResult<TaskRecord>> {
		const task = await this.get(id);
		if (!task) return { error: taskError("not_found", `Task ${formatTaskId(id)} not found.`) };
		if (isTaskClosed(task.status))
			return { error: taskError("invalid_status", `Task ${formatTaskId(id)} is closed.`) };
		if (task.assignedToSession && task.assignedToSession !== sessionId && !force) {
			return {
				error: taskError(
					"active_task_conflict",
					`Task ${formatTaskId(id)} is already assigned to session ${task.assignedToSession}.`,
				),
			};
		}
		return this.update({ id, assignedToSession: sessionId }, sessionId);
	}

	async release(id: string, sessionId: string, force = false): Promise<TaskStoreResult<TaskRecord>> {
		const task = await this.get(id);
		if (!task) return { error: taskError("not_found", `Task ${formatTaskId(id)} not found.`) };
		if (task.assignedToSession && task.assignedToSession !== sessionId && !force) {
			return {
				error: taskError(
					"active_task_conflict",
					`Task ${formatTaskId(id)} is assigned to session ${task.assignedToSession}.`,
				),
			};
		}
		return this.update({ id, assignedToSession: null }, sessionId);
	}

	async appendNote(id: string, note: string, sessionId?: string | null): Promise<TaskStoreResult<TaskRecord>> {
		const task = await this.get(id);
		if (!task) return { error: taskError("not_found", `Task ${formatTaskId(id)} not found.`) };
		const trimmed = note.trim();
		if (!trimmed) return task;
		const notes = task.context?.notes ? `${task.context.notes}\n\n${trimmed}` : trimmed;
		return this.update({ id, context: { ...task.context, notes } }, sessionId);
	}

	getTaskPath(id: string): string {
		return path.join(this.todosDir, `${normalizeTaskId(id)}.md`);
	}

	async rebuildSnapshot(): Promise<TaskSnapshot> {
		const events = await this.readEvents();
		const tasks = applyEvents(events);
		const now = new Date().toISOString();
		const snapshot: TaskSnapshot = { version: TASK_SCHEMA_VERSION, tasks: sortTasks(tasks), updatedAt: now };
		await this.writeSnapshot(snapshot);
		await this.appendEvent({ type: "task.snapshot_rebuilt", timestamp: now });
		return snapshot;
	}

	private get eventsPath(): string {
		return path.join(this.todosDir, TASK_EVENTS_FILE);
	}

	private get snapshotPath(): string {
		return path.join(this.todosDir, TASK_SNAPSHOT_FILE);
	}

	private get lockPath(): string {
		return path.join(this.todosDir, TASK_LOCK_FILE);
	}

	private async ensureDir(): Promise<void> {
		await fs.mkdir(this.todosDir, { recursive: true });
	}

	private async readSnapshot(): Promise<TaskSnapshot> {
		await this.ensureDir();
		try {
			const raw = await fs.readFile(this.snapshotPath, "utf8");
			const parsed = JSON.parse(raw) as Partial<TaskSnapshot>;
			if (parsed.version !== TASK_SCHEMA_VERSION || !Array.isArray(parsed.tasks)) {
				return this.rebuildSnapshot();
			}
			return {
				version: TASK_SCHEMA_VERSION,
				tasks: parsed.tasks.map(normalizeTaskRecord).filter((task): task is TaskRecord => task !== null),
				updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
			};
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT")
				return { version: TASK_SCHEMA_VERSION, tasks: [], updatedAt: new Date().toISOString() };
			throw error;
		}
	}

	private async writeSnapshot(snapshot: TaskSnapshot): Promise<void> {
		await this.ensureDir();
		const tmpPath = path.join(this.todosDir, `${TASK_SNAPSHOT_FILE}.${process.pid}.${Date.now()}.tmp`);
		await fs.writeFile(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
		await fs.rename(tmpPath, this.snapshotPath);
	}

	private async appendEvent(event: TaskEvent): Promise<void> {
		await fs.appendFile(this.eventsPath, `${JSON.stringify(event)}\n`, "utf8");
	}

	private async writeInitialEvents(tasks: TaskRecord[]): Promise<void> {
		const events = tasks.map(
			(task): TaskEvent => ({
				type: "task.created",
				taskId: task.id,
				task,
				revision: task.revision,
				timestamp: task.createdAt,
			}),
		);
		await fs.writeFile(this.eventsPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
	}

	private async readEvents(): Promise<TaskEvent[]> {
		try {
			const raw = await fs.readFile(this.eventsPath, "utf8");
			const events: TaskEvent[] = [];
			for (const line of raw.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				const parsed = JSON.parse(trimmed) as TaskEvent;
				events.push(parsed);
			}
			return events;
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT") return [];
			throw error;
		}
	}

	private async generateId(existingTasks: TaskRecord[]): Promise<string> {
		const existingIds = new Set(existingTasks.map((task) => task.id));
		for (let attempt = 0; attempt < 20; attempt += 1) {
			const id = crypto.randomBytes(4).toString("hex");
			if (!existingIds.has(id)) return id;
		}
		throw new Error("Failed to generate unique task id");
	}

	private async readLegacyMarkdownTasks(): Promise<LegacyTodoRecord[]> {
		let entries: string[] = [];
		try {
			entries = await fs.readdir(this.todosDir);
		} catch {
			return [];
		}
		const tasks: LegacyTodoRecord[] = [];
		for (const entry of entries) {
			if (!entry.endsWith(".md")) continue;
			const id = entry.slice(0, -3);
			const filePath = path.join(this.todosDir, entry);
			try {
				const content = await fs.readFile(filePath, "utf8");
				tasks.push(parseLegacyTodo(content, id));
			} catch {
				// Ignore unreadable legacy todo files during one-time migration.
			}
		}
		return tasks;
	}

	private legacyToTask(todo: LegacyTodoRecord): TaskRecord {
		const notes = [todo.body.trim(), todo.tags.length ? `Tags: ${todo.tags.join(", ")}` : ""]
			.filter(Boolean)
			.join("\n\n");
		const status = toTaskStatus(todo.status);
		const updatedAt = todo.createdAt || new Date().toISOString();
		return {
			id: normalizeTaskId(todo.id).toLowerCase(),
			title: todo.title || "(untitled)",
			status,
			createdAt: updatedAt,
			updatedAt,
			completedAt: status === "completed" ? updatedAt : undefined,
			revision: 1,
			assignedToSession: todo.assignedToSession,
			context: notes ? { notes } : undefined,
		};
	}

	private async acquireLock(session?: string | null): Promise<(() => Promise<void>) | TaskStoreError> {
		const now = Date.now();
		for (let attempt = 0; attempt < 2; attempt += 1) {
			let handle: fs.FileHandle | null = null;
			try {
				handle = await fs.open(this.lockPath, "wx");
				const info: LockInfo = { pid: process.pid, session, createdAt: new Date(now).toISOString() };
				await handle.writeFile(`${JSON.stringify(info, null, 2)}\n`, "utf8");
				await handle.close();
				handle = null;
				return async () => {
					await fs.unlink(this.lockPath).catch(() => undefined);
				};
			} catch (error) {
				if (handle) await handle.close().catch(() => undefined);
				const nodeError = error as NodeJS.ErrnoException;
				if (nodeError.code !== "EEXIST") {
					return taskError("lock_failed", `Failed to acquire task store lock: ${nodeError.message}`);
				}
				const stats = await fs.stat(this.lockPath).catch(() => null);
				const lockAge = stats ? now - stats.mtimeMs : LOCK_TTL_MS + 1;
				if (lockAge <= LOCK_TTL_MS) {
					const owner = await this.readLockOwner();
					return taskError("lock_failed", `Task store is locked${owner ? ` by ${owner}` : ""}. Try again later.`);
				}
				await fs.unlink(this.lockPath).catch(() => undefined);
			}
		}
		return taskError("lock_failed", "Failed to acquire task store lock.");
	}

	private async readLockOwner(): Promise<string | null> {
		try {
			const raw = await fs.readFile(this.lockPath, "utf8");
			const parsed = JSON.parse(raw) as Partial<LockInfo>;
			return typeof parsed.session === "string" ? parsed.session : null;
		} catch {
			return null;
		}
	}

	private async withLock<T>(session: string | null | undefined, fn: () => Promise<T>): Promise<TaskStoreResult<T>> {
		const lock = await this.acquireLock(session);
		if ("code" in lock) return { error: lock };
		try {
			return await fn();
		} finally {
			await lock();
		}
	}
}

export function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
	const statusRank: Record<TaskStatus, number> = {
		in_progress: 0,
		blocked: 1,
		pending: 2,
		completed: 3,
		deleted: 4,
	};
	return [...tasks].sort((a, b) => {
		const statusDiff = statusRank[a.status] - statusRank[b.status];
		if (statusDiff !== 0) return statusDiff;
		return a.createdAt.localeCompare(b.createdAt);
	});
}

function findActiveTask(tasks: TaskRecord[], sessionId: string, exceptId?: string): TaskRecord | undefined {
	return tasks.find(
		(task) => task.id !== exceptId && task.assignedToSession === sessionId && task.status === "in_progress",
	);
}

function applyPatch(task: TaskRecord, patch: TaskPatch): TaskRecord {
	return {
		...task,
		title: patch.title ?? task.title,
		status: patch.status ?? task.status,
		assignedToSession:
			patch.assignedToSession === null
				? undefined
				: patch.assignedToSession === undefined
					? task.assignedToSession
					: patch.assignedToSession,
		context: patch.context === undefined ? task.context : patch.context,
	};
}

function normalizeContext(context: TaskContext | undefined): { context?: TaskContext } | { error: TaskStoreError } {
	if (!context) return { context: undefined };
	const normalized: TaskContext = {};
	if (context.why !== undefined) {
		const why = context.why.trim();
		if (why.length > 240)
			return { error: taskError("invalid_context", "Task context why must be 240 characters or less.") };
		if (why) normalized.why = why;
	}
	if (context.files !== undefined) {
		if (context.files.length > 12)
			return { error: taskError("invalid_context", "Task context files must have 12 items or fewer.") };
		const files = context.files.map((file) => file.trim()).filter(Boolean);
		if (files.length) normalized.files = files;
	}
	if (context.doneWhen !== undefined) {
		if (context.doneWhen.length > 5)
			return { error: taskError("invalid_context", "Task context doneWhen must have 5 items or fewer.") };
		const doneWhen = context.doneWhen.map((item) => item.trim()).filter(Boolean);
		if (doneWhen.length) normalized.doneWhen = doneWhen;
	}
	if (context.notes !== undefined) {
		const notes = context.notes.trim();
		if (notes.length > 1000)
			return { error: taskError("invalid_context", "Task context notes must be 1000 characters or less.") };
		if (notes) normalized.notes = notes;
	}
	return Object.keys(normalized).length ? { context: normalized } : { context: undefined };
}

function normalizeTaskRecord(value: unknown): TaskRecord | null {
	if (!value || typeof value !== "object") return null;
	const record = value as Partial<TaskRecord>;
	if (typeof record.id !== "string" || typeof record.title !== "string") return null;
	const status = toTaskStatus(record.status);
	return {
		id: normalizeTaskId(record.id).toLowerCase(),
		title: record.title,
		status,
		createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
		updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
		completedAt: typeof record.completedAt === "string" ? record.completedAt : undefined,
		revision: typeof record.revision === "number" && Number.isFinite(record.revision) ? record.revision : 1,
		assignedToSession: typeof record.assignedToSession === "string" ? record.assignedToSession : undefined,
		context: record.context,
	};
}

function applyEvents(events: TaskEvent[]): TaskRecord[] {
	const tasks = new Map<string, TaskRecord>();
	for (const event of events) {
		if (!event.taskId && !event.task) continue;
		const id = event.taskId ?? event.task?.id;
		if (!id) continue;
		if (event.task) {
			tasks.set(normalizeTaskId(id).toLowerCase(), event.task);
			continue;
		}
		if (event.patch) {
			const existing = tasks.get(normalizeTaskId(id).toLowerCase());
			if (existing) tasks.set(existing.id, applyPatch(existing, event.patch));
		}
	}
	return Array.from(tasks.values());
}

function parseLegacyTodo(content: string, idFallback: string): LegacyTodoRecord {
	const { frontMatter, body } = splitLegacyFrontMatter(content);
	const parsed = parseLegacyFrontMatter(frontMatter);
	return {
		id: parsed.id ?? idFallback,
		title: parsed.title ?? "",
		tags: parsed.tags ?? [],
		status: parsed.status ?? "open",
		createdAt: parsed.created_at ?? new Date().toISOString(),
		assignedToSession: parsed.assigned_to_session,
		body,
	};
}

function splitLegacyFrontMatter(content: string): { frontMatter: string; body: string } {
	if (!content.startsWith("{")) return { frontMatter: "", body: content };
	const endIndex = findJsonObjectEnd(content);
	if (endIndex === -1) return { frontMatter: "", body: content };
	return {
		frontMatter: content.slice(0, endIndex + 1),
		body: content.slice(endIndex + 1).replace(/^\r?\n+/, ""),
	};
}

function parseLegacyFrontMatter(text: string): LegacyTodoFrontMatter {
	if (!text.trim()) return {};
	try {
		const parsed = JSON.parse(text) as LegacyTodoFrontMatter | null;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function findJsonObjectEnd(content: string): number {
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = 0; i < content.length; i += 1) {
		const char = content[i];
		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === '"') inString = false;
			continue;
		}
		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === "{") depth += 1;
		if (char === "}") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return -1;
}
