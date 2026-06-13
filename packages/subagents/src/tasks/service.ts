import type { SubAgentEvent } from "../types.js";
import { resolveTodosDir, TaskStore } from "./store.js";
import type { CreateTaskInput, TaskRecord, TaskStoreResult, UpdateTaskInput } from "./types.js";

type TaskChangeAction = Extract<SubAgentEvent, { type: "task.changed" }>["action"];

export class TaskService {
	private readonly store: TaskStore;

	constructor(
		cwd: string,
		private readonly emitEvent?: (event: SubAgentEvent) => void,
	) {
		this.store = new TaskStore(resolveTodosDir(cwd));
	}

	getStore(): TaskStore {
		return this.store;
	}

	async list(options: { includeDeleted?: boolean } = {}): Promise<TaskRecord[]> {
		await this.store.initialize();
		return this.store.list(options);
	}

	async get(id: string): Promise<TaskRecord | null> {
		await this.store.initialize();
		return this.store.get(id);
	}

	async create(input: CreateTaskInput, sessionId?: string | null): Promise<TaskStoreResult<TaskRecord>> {
		await this.store.initialize();
		const result = await this.store.create(input, sessionId);
		this.emitChanged("created", result);
		return result;
	}

	async update(input: UpdateTaskInput, sessionId?: string | null): Promise<TaskStoreResult<TaskRecord>> {
		await this.store.initialize();
		const result = await this.store.update(input, sessionId);
		this.emitChanged(readAction(result, "updated"), result);
		return result;
	}

	async complete(
		id: string,
		expectedRevision?: number,
		sessionId?: string | null,
	): Promise<TaskStoreResult<TaskRecord>> {
		await this.store.initialize();
		const result = await this.store.complete(id, expectedRevision, sessionId);
		this.emitChanged("completed", result);
		return result;
	}

	async block(
		id: string,
		reason: string,
		expectedRevision?: number,
		sessionId?: string | null,
	): Promise<TaskStoreResult<TaskRecord>> {
		await this.store.initialize();
		const result = await this.store.block(id, reason, expectedRevision, sessionId);
		this.emitChanged("blocked", result);
		return result;
	}

	async softDelete(
		id: string,
		expectedRevision?: number,
		sessionId?: string | null,
	): Promise<TaskStoreResult<TaskRecord>> {
		await this.store.initialize();
		const result = await this.store.softDelete(id, expectedRevision, sessionId);
		this.emitChanged("deleted", result);
		return result;
	}

	private emitChanged(action: TaskChangeAction, result: TaskStoreResult<TaskRecord>): void {
		if (!this.emitEvent || (typeof result === "object" && "error" in result)) return;
		this.emitEvent({
			type: "task.changed",
			action,
			taskId: result.id,
			task: result,
			timestamp: Date.now(),
		});
	}
}

function readAction(result: TaskStoreResult<TaskRecord>, fallback: TaskChangeAction): TaskChangeAction {
	if (typeof result === "object" && "error" in result) return fallback;
	if (result.status === "completed") return "completed";
	if (result.status === "blocked") return "blocked";
	if (result.status === "deleted") return "deleted";
	return fallback;
}
