import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { implement, ORPCError } from "@orpc/server";
import type { LionChecklistKind, LionStrategyName } from "../lion/types.js";
import { isTaskStoreError } from "../tasks/store.js";
import type { TaskRecord, TaskStoreError, TaskStoreResult } from "../tasks/types.js";
import type { VirtualInstance } from "../transport/state-manager.js";
import type { DashboardLionState, DashboardThreadState } from "../transport/types.js";
import type { SubAgentRunRecord, SubAgentState } from "../types.js";
import type { SubagentsApiContext } from "./context.js";
import { subagentsContract } from "./contract.js";
import {
	formatDashboardModels,
	getAgentSessionCommands,
	sendToAgentSession,
	type ThreadPromptImage,
	type ThreadPromptMode,
} from "./session-control.js";
import type { DashboardLogLevel } from "./session-log-store.js";
import type { SubagentsOutputs } from "./types.js";

const DEFAULT_LION_STATE: DashboardLionState = {
	active: false,
	strategy: "none",
	phase: "planning",
	activePlanPath: null,
	activePlanSlug: null,
	planKind: null,
	activeTaskId: null,
	lastRunId: null,
};

function projectRunRecord(record: SubAgentRunRecord): DashboardThreadState {
	const endTime = record.completedAt ?? (record.status === "running" ? null : record.updatedAt);
	return {
		instanceId: record.instanceId,
		taskId: record.taskId,
		definitionName: record.definitionName,
		cwd: record.cwd,
		parentThreadId: record.parentThreadId,
		parentToolCallId: record.parentToolCallId,
		runId: record.runId,
		runIndex: record.runIndex,
		description: record.description,
		state: mapRunStatusToState(record.status),
		startTime: record.startedAt,
		endTime,
		turnCount: record.turnCount,
		lastActivityAt: record.updatedAt,
		currentTool: null,
		error: record.error ?? null,
		toolCount: record.toolCount,
		currentToolStartedAt: null,
		durationMs: endTime ? endTime - record.startedAt : Date.now() - record.startedAt,
		kind: "subagent",
		isLive: false,
		sessionId: record.sessionId,
		modelProvider: record.modelProvider,
		modelId: record.modelId,
	};
}

function mergeRunRecordIntoThread(thread: DashboardThreadState, record: SubAgentRunRecord): DashboardThreadState {
	const projected = projectRunRecord(record);
	return {
		...projected,
		...thread,
		parentThreadId: thread.parentThreadId ?? projected.parentThreadId,
		parentToolCallId: thread.parentToolCallId ?? projected.parentToolCallId,
		runId: thread.runId ?? projected.runId,
		runIndex: thread.runIndex ?? projected.runIndex,
		description: thread.description ?? projected.description,
		startTime: thread.startTime ?? projected.startTime,
		endTime: thread.endTime ?? projected.endTime,
		lastActivityAt: Math.max(thread.lastActivityAt, projected.lastActivityAt),
		error: thread.error ?? projected.error,
		sessionId: thread.sessionId ?? projected.sessionId,
		modelProvider: thread.modelProvider ?? projected.modelProvider,
		modelId: thread.modelId ?? projected.modelId,
	};
}

function mapRunStatusToState(status: SubAgentRunRecord["status"]): SubAgentState {
	switch (status) {
		case "completed":
			return "completed";
		case "blocked":
			return "blocked";
		case "running":
			return "running";
		case "cancelled":
			return "cancelled";
		case "timed_out":
			return "timed_out";
		default:
			return "failed";
	}
}

async function tryOpenSession(
	threadId: string,
	virtual: VirtualInstance,
	runStore: { list(): Promise<SubAgentRunRecord[]> },
): Promise<SessionManager | null> {
	if (virtual.sessionFile) {
		try {
			return SessionManager.open(virtual.sessionFile);
		} catch {
			// Fall through to try run record
		}
	}

	if (virtual.sessionId) {
		try {
			const records = await runStore.list();
			const record = records.find((r) => r.instanceId === threadId);
			if (record?.cwd && record.sessionId) {
				const sessionPath = join(record.cwd, ".pi", "sessions", `${record.sessionId}.json`);
				return SessionManager.open(sessionPath);
			}
		} catch {
			// Not found or inaccessible
		}
	}

	return null;
}

function isStandaloneSession(threadId: string): boolean {
	return threadId.startsWith("standalone-");
}

async function getStandaloneThreads(ctx: SubagentsApiContext): Promise<DashboardThreadState[]> {
	return ctx.standaloneSessions.list().map((info) => info.state);
}

async function getSubagentThreads(ctx: SubagentsApiContext): Promise<DashboardThreadState[]> {
	const currentMainThreadId = ctx.mainSession?.getThread()?.instanceId;
	const controllerStates = ctx.controller.getInstanceStates();
	for (const state of controllerStates) {
		ctx.stateManager.registerLiveInstance(state);
	}
	await ctx.stateManager.loadFromRunStore();
	const runRecords = filterThreadsForMainSession(await ctx.runStore.list(), currentMainThreadId);
	const byInstanceId = new Map<string, DashboardThreadState>();
	const runsByInstanceId = new Map(runRecords.map((record) => [record.instanceId, record]));

	for (const record of runRecords) {
		byInstanceId.set(record.instanceId, projectRunRecord(record));
	}

	for (const state of filterThreadsForMainSession(ctx.stateManager.getAllInstances(), currentMainThreadId)) {
		const runRecord = runsByInstanceId.get(state.instanceId);
		byInstanceId.set(state.instanceId, runRecord ? mergeRunRecordIntoThread(state, runRecord) : state);
	}

	return Array.from(byInstanceId.values()).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

function filterThreadsForMainSession<T extends { parentThreadId?: string }>(
	threads: T[],
	currentMainThreadId: string | undefined,
): T[] {
	if (!currentMainThreadId) return threads;
	return threads.filter((thread) => thread.parentThreadId === currentMainThreadId);
}

async function findRunRecord(ctx: SubagentsApiContext, threadId: string): Promise<SubAgentRunRecord | undefined> {
	return (await ctx.runStore.list()).find((candidate) => candidate.instanceId === threadId);
}

async function resolveLogSessionId(ctx: SubagentsApiContext, threadId?: string): Promise<string | null> {
	const main = ctx.mainSession?.getThread();
	if (!threadId) return main?.sessionId ?? null;
	if (main?.instanceId === threadId) return main.sessionId ?? null;

	const live = ctx.controller.getInstanceById(threadId)?.getState();
	if (live?.sessionId) return live.sessionId;

	const state = ctx.stateManager.getInstance(threadId);
	if (state?.sessionId) return state.sessionId;

	const record = await findRunRecord(ctx, threadId);
	return record?.sessionId ?? null;
}

async function logDashboardControl(
	ctx: SubagentsApiContext,
	input: {
		threadId: string;
		type: string;
		source: string;
		level?: DashboardLogLevel;
		data: Record<string, unknown>;
	},
): Promise<void> {
	try {
		const sessionId = await resolveLogSessionId(ctx, input.threadId);
		if (!sessionId) return;
		await ctx.logStore.append({
			sessionId,
			threadId: input.threadId,
			type: input.type,
			source: input.source,
			level: input.level ?? "info",
			data: input.data,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[subagents] dashboard log failed: ${message}`);
	}
}

function errorData(error: unknown): Record<string, unknown> {
	return {
		error: error instanceof Error ? error.message : String(error),
	};
}

function taskOrThrow(result: TaskStoreResult<TaskRecord>): { task: TaskRecord } {
	if (!isTaskStoreError(result)) return { task: result };
	throw new ORPCError(mapTaskErrorCode(result.error), { message: result.error.message });
}

function mapTaskErrorCode(error: TaskStoreError): "BAD_REQUEST" | "NOT_FOUND" | "SERVICE_UNAVAILABLE" {
	switch (error.code) {
		case "not_found":
			return "NOT_FOUND";
		case "lock_failed":
		case "storage_error":
			return "SERVICE_UNAVAILABLE";
		default:
			return "BAD_REQUEST";
	}
}

async function getVirtualSessionFile(
	ctx: SubagentsApiContext,
	threadId: string,
): Promise<{ record: SubAgentRunRecord; sessionFile?: string } | null> {
	const virtual = ctx.stateManager.getInstance(threadId);
	const record = await findRunRecord(ctx, threadId);
	if (!record) return null;
	return { record, sessionFile: virtual?.sessionFile };
}

async function sendThreadMessage(
	ctx: SubagentsApiContext,
	threadId: string,
	message: string,
	mode: ThreadPromptMode,
	images?: ThreadPromptImage[],
): Promise<void> {
	const main = ctx.mainSession?.getThread();
	if (main?.instanceId === threadId) {
		if (!ctx.mainSession?.sendMessage) {
			throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Main session is not controllable" });
		}
		await ctx.mainSession.sendMessage(threadId, message, mode, images);
		return;
	}

	const instance = ctx.controller.getInstanceById(threadId);
	if (instance) {
		const state = instance.getState();
		if (state.state === "created" || state.state === "starting") {
			throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Session not ready" });
		}
		if (mode === "follow_up") {
			await ctx.controller.instanceFollowUp(state.taskId, message, images);
		} else if (mode === "steer") {
			await ctx.controller.steerInstance(state.taskId, message, images);
		} else {
			await ctx.controller.promptInstance(state.taskId, message, { images });
		}
		return;
	}

	const resumable = await getVirtualSessionFile(ctx, threadId);
	if (resumable) {
		try {
			const cached = await ctx.sessionCache.getOrCreate(resumable.record, resumable.sessionFile);
			await sendToAgentSession(cached.session, message, mode, images);
			return;
		} catch (error) {
			throw new ORPCError("SERVICE_UNAVAILABLE", {
				message: error instanceof Error ? error.message : "Session not resumable",
			});
		}
	}

	if (isStandaloneSession(threadId)) {
		const info = ctx.standaloneSessions.get(threadId);
		if (info) {
			await ctx.standaloneSessions.prompt(threadId, message, mode, images);
			return;
		}
	}

	throw new ORPCError("NOT_FOUND", { message: "Thread not found" });
}

async function listThreadCommands(
	ctx: SubagentsApiContext,
	threadId: string,
): Promise<SubagentsOutputs["threads"]["commands"]> {
	const main = ctx.mainSession?.getThread();
	if (main?.instanceId === threadId) {
		return (await ctx.mainSession?.getCommands?.(threadId)) ?? [];
	}

	const instance = ctx.controller.getInstanceById(threadId);
	if (instance) {
		const state = instance.getState();
		if (state.state === "created" || state.state === "starting") {
			throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Session not ready" });
		}
		return ctx.controller.instanceGetCommands(state.taskId);
	}

	const cached = ctx.sessionCache.get(threadId);
	if (cached) return getAgentSessionCommands(cached.session);

	const resumable = await getVirtualSessionFile(ctx, threadId);
	if (resumable) {
		try {
			const session = await ctx.sessionCache.getOrCreate(resumable.record, resumable.sessionFile);
			return getAgentSessionCommands(session.session);
		} catch (error) {
			throw new ORPCError("SERVICE_UNAVAILABLE", {
				message: error instanceof Error ? error.message : "Session not resumable",
			});
		}
	}

	if (isStandaloneSession(threadId)) {
		const info = ctx.standaloneSessions.get(threadId);
		if (info) {
			return ctx.standaloneSessions.getCommands(threadId);
		}
	}

	throw new ORPCError("NOT_FOUND", { message: "Thread not found" });
}

async function listThreadModels(
	ctx: SubagentsApiContext,
	threadId: string,
): Promise<SubagentsOutputs["threads"]["models"]> {
	const main = ctx.mainSession?.getThread();
	if (main?.instanceId === threadId) {
		return (await ctx.mainSession?.getModels?.(threadId)) ?? [];
	}

	const instance = ctx.controller.getInstanceById(threadId);
	if (instance) {
		const state = instance.getState();
		if (state.state === "created" || state.state === "starting") {
			throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Session not ready" });
		}
		return formatDashboardModels(await instance.getAvailableModels());
	}

	const cached = ctx.sessionCache.get(threadId);
	if (cached) return formatDashboardModels(await cached.session.modelRegistry.getAvailable());

	const resumable = await getVirtualSessionFile(ctx, threadId);
	if (resumable) {
		try {
			const session = await ctx.sessionCache.getOrCreate(resumable.record, resumable.sessionFile);
			return formatDashboardModels(await session.session.modelRegistry.getAvailable());
		} catch (error) {
			throw new ORPCError("SERVICE_UNAVAILABLE", {
				message: error instanceof Error ? error.message : "Session not resumable",
			});
		}
	}

	if (isStandaloneSession(threadId)) {
		const info = ctx.standaloneSessions.get(threadId);
		if (info) {
			return formatDashboardModels(await ctx.standaloneSessions.getAvailableModels(threadId));
		}
	}

	throw new ORPCError("NOT_FOUND", { message: "Thread not found" });
}

async function selectThreadModel(
	ctx: SubagentsApiContext,
	threadId: string,
	provider: string,
	modelId: string,
): Promise<SubagentsOutputs["threads"]["model"]> {
	const main = ctx.mainSession?.getThread();
	if (main?.instanceId === threadId) {
		const selected = await ctx.mainSession?.setModel?.(threadId, provider, modelId);
		if (!selected) {
			throw new ORPCError("BAD_REQUEST", { message: "Model is unavailable or not authenticated" });
		}
		return { threadId, provider, modelId, status: "selected" as const, selectedAt: Date.now() };
	}

	const instance = ctx.controller.getInstanceById(threadId);
	if (instance) {
		const state = instance.getState();
		if (state.state === "created" || state.state === "starting") {
			throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Session not ready" });
		}
		const model = (await instance.getAvailableModels()).find(
			(candidate) => candidate.provider === provider && candidate.id === modelId,
		);
		if (!model) {
			throw new ORPCError("BAD_REQUEST", { message: "Model is unavailable or not authenticated" });
		}
		await instance.setModel(model);
		return { threadId, provider, modelId, status: "selected" as const, selectedAt: Date.now() };
	}

	const cached = ctx.sessionCache.get(threadId);
	if (cached) {
		const model = cached.session.modelRegistry
			.getAvailable()
			.find((candidate) => candidate.provider === provider && candidate.id === modelId);
		if (!model) {
			throw new ORPCError("BAD_REQUEST", { message: "Model is unavailable or not authenticated" });
		}
		await cached.session.setModel(model);
		const state = ctx.stateManager.getInstance(cached.instanceId);
		if (state) {
			ctx.emitEvent({
				type: "instance.state",
				instanceId: cached.instanceId,
				taskId: cached.taskId,
				state: {
					...state,
					modelProvider: model.provider,
					modelId: model.id,
					lastActivityAt: Date.now(),
				},
				timestamp: Date.now(),
			});
		}
		return { threadId, provider, modelId, status: "selected" as const, selectedAt: Date.now() };
	}

	const resumable = await getVirtualSessionFile(ctx, threadId);
	if (resumable) {
		try {
			const session = await ctx.sessionCache.getOrCreate(resumable.record, resumable.sessionFile);
			return selectThreadModel(ctx, session.instanceId, provider, modelId);
		} catch (error) {
			throw new ORPCError("SERVICE_UNAVAILABLE", {
				message: error instanceof Error ? error.message : "Session not resumable",
			});
		}
	}

	if (isStandaloneSession(threadId)) {
		const info = ctx.standaloneSessions.get(threadId);
		if (info) {
			const model = await ctx.standaloneSessions.setModel(threadId, provider, modelId);
			if (!model) {
				throw new ORPCError("BAD_REQUEST", { message: "Model is unavailable or not authenticated" });
			}
			return { threadId, provider, modelId, status: "selected" as const, selectedAt: Date.now() };
		}
	}

	throw new ORPCError("NOT_FOUND", { message: "Thread not found" });
}

async function abortThread(ctx: SubagentsApiContext, threadId: string): Promise<void> {
	const main = ctx.mainSession?.getThread();
	if (main?.instanceId === threadId) {
		if (!ctx.mainSession?.abort) {
			throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Main session is not controllable" });
		}
		await ctx.mainSession.abort(threadId);
		return;
	}

	const instance = ctx.controller.getInstanceById(threadId);
	if (instance) {
		const state = instance.getState();
		await ctx.controller.abortInstance(state.taskId);
		return;
	}

	const cached = ctx.sessionCache.get(threadId);
	if (cached) {
		await cached.session.abort();
		return;
	}

	const resumable = await getVirtualSessionFile(ctx, threadId);
	if (resumable) {
		try {
			const session = await ctx.sessionCache.getOrCreate(resumable.record, resumable.sessionFile);
			await session.session.abort();
			return;
		} catch (error) {
			throw new ORPCError("SERVICE_UNAVAILABLE", {
				message: error instanceof Error ? error.message : "Session not resumable",
			});
		}
	}

	if (isStandaloneSession(threadId)) {
		const info = ctx.standaloneSessions.get(threadId);
		if (info) {
			await ctx.standaloneSessions.abort(threadId);
			return;
		}
	}

	throw new ORPCError("NOT_FOUND", { message: "Thread not found" });
}

export function createSubagentsRouter(ctx: SubagentsApiContext) {
	const impl = implement(subagentsContract).$context<SubagentsApiContext>();

	return impl.router({
		threads: {
			list: impl.threads.list.handler(async () => {
				const main = ctx.mainSession?.getThread();
				const subagents = await getSubagentThreads(ctx);
				const standalones = await getStandaloneThreads(ctx);
				const threads = main ? [main, ...standalones, ...subagents] : [...standalones, ...subagents];
				return threads;
			}),

			create: impl.threads.create.handler(async ({ input }) => {
				const info = await ctx.standaloneSessions.create({
					cwd: input.cwd ?? ctx.cwd,
					name: input.name,
				});
				return {
					threadId: info.instanceId,
					name: info.name,
					createdAt: info.createdAt,
					cwd: info.state.cwd,
				};
			}),

			get: impl.threads.get.handler(async ({ input }) => {
				const threadId = input.threadId;
				const main = ctx.mainSession?.getThread();
				if (main?.instanceId === threadId) {
					return main;
				}
				const standalone = ctx.standaloneSessions.get(threadId);
				if (standalone) {
					return standalone.state;
				}
				const state = ctx.stateManager.getInstance(threadId);
				if (!state) {
					const record = (await ctx.runStore.list()).find((candidate) => candidate.instanceId === threadId);
					if (!record) {
						throw new ORPCError("NOT_FOUND", { message: "Not Found" });
					}
					return projectRunRecord(record);
				}
				const record = (await ctx.runStore.list()).find((candidate) => candidate.instanceId === threadId);
				return record ? mergeRunRecordIntoThread(state, record) : state;
			}),

			session: impl.threads.session.handler(async ({ input }) => {
				const threadId = input.threadId;
				const mainMessages = ctx.mainSession?.getMessages(threadId);
				const main = ctx.mainSession?.getThread();
				if (mainMessages && main?.instanceId === threadId) {
					return {
						sessionId: main.sessionId!,
						messages: mainMessages as SubagentsOutputs["threads"]["messages"],
					};
				}

				const standalone = ctx.standaloneSessions.get(threadId);
				if (standalone) {
					return {
						sessionId: standalone.sessionId,
						messages: standalone.session.messages as SubagentsOutputs["threads"]["messages"],
					};
				}

				const instance = ctx.controller.getInstanceById(threadId);
				if (instance) {
					const state = instance.getState();
					if (state.state === "created" || state.state === "starting") {
						throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Session not ready" });
					}
					const rpcState = instance.getRpcState();
					const messages = instance.getMessages();
					return {
						sessionId: rpcState.sessionId,
						messages: messages as SubagentsOutputs["threads"]["messages"],
					};
				}

				const virtual = ctx.stateManager.getInstance(threadId);
				if (virtual?.sessionFile || virtual?.sessionId) {
					const sm = await tryOpenSession(threadId, virtual, ctx.runStore);
					if (sm) {
						const sessionContext = sm.buildSessionContext();
						return {
							sessionId: sm.getSessionId(),
							messages: sessionContext.messages as SubagentsOutputs["threads"]["messages"],
						};
					}
				}

				throw new ORPCError("NOT_FOUND", { message: "Not Found" });
			}),

			messages: impl.threads.messages.handler(async ({ input }) => {
				const threadId = input.threadId;
				const mainMessages = ctx.mainSession?.getMessages(threadId);
				if (mainMessages) {
					return mainMessages as SubagentsOutputs["threads"]["messages"];
				}

				const standalone = ctx.standaloneSessions.get(threadId);
				if (standalone) {
					return standalone.session.messages as SubagentsOutputs["threads"]["messages"];
				}

				const instance = ctx.controller.getInstanceById(threadId);
				if (instance) {
					const state = instance.getState();
					if (state.state === "created" || state.state === "starting") {
						throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Session not ready" });
					}
					const messages = instance.getMessages();
					return messages as SubagentsOutputs["threads"]["messages"];
				}

				const virtual = ctx.stateManager.getInstance(threadId);
				if (virtual?.sessionFile || virtual?.sessionId) {
					const sm = await tryOpenSession(threadId, virtual, ctx.runStore);
					if (sm) {
						return sm.buildSessionContext().messages as SubagentsOutputs["threads"]["messages"];
					}
				}

				throw new ORPCError("NOT_FOUND", { message: "Not Found" });
			}),

			events: impl.threads.events.handler(async ({ input }) => {
				const threadId = input.threadId;
				const main = ctx.mainSession?.getThread();
				if (main?.instanceId === threadId) {
					return ctx.mainSession?.getEvents(threadId) ?? [];
				}
				if (isStandaloneSession(threadId)) {
					return ctx.stateManager.getEvents(threadId);
				}
				const events = await ctx.stateManager.getEvents(threadId);
				return events;
			}),

			run: impl.threads.run.handler(async ({ input }) => {
				const threadId = input.threadId;
				const main = ctx.mainSession?.getThread();
				if (main?.instanceId === threadId) {
					throw new ORPCError("NOT_FOUND", { message: "Run record not available" });
				}

				const live = ctx.controller.getInstanceById(threadId)?.getState();
				const state = live ?? ctx.stateManager.getInstance(threadId);
				if (!state?.sessionId) {
					const record = (await ctx.runStore.list()).find((candidate) => candidate.instanceId === threadId);
					if (!record) {
						throw new ORPCError("NOT_FOUND", { message: "Run record not available" });
					}
					return record;
				}

				const record = await ctx.runStore.read(state.sessionId, state.taskId);
				if (!record) {
					throw new ORPCError("NOT_FOUND", { message: "Run record not found" });
				}
				return record;
			}),

			prompt: impl.threads.prompt.handler(async ({ input }) => {
				await logDashboardControl(ctx, {
					threadId: input.threadId,
					type: "thread.prompt.request",
					source: "dashboard",
					data: { mode: input.mode, messageLength: input.message.length, imageCount: input.images?.length ?? 0 },
				});
				try {
					await sendThreadMessage(ctx, input.threadId, input.message.trim(), input.mode, input.images);
					const acceptedAt = Date.now();
					await logDashboardControl(ctx, {
						threadId: input.threadId,
						type: "thread.prompt.accepted",
						source: "dashboard",
						data: { mode: input.mode, acceptedAt },
					});
					return {
						threadId: input.threadId,
						mode: input.mode,
						status: "sent" as const,
						acceptedAt,
					};
				} catch (error) {
					await logDashboardControl(ctx, {
						threadId: input.threadId,
						type: "thread.prompt.failed",
						source: "dashboard",
						level: "error",
						data: { mode: input.mode, ...errorData(error) },
					});
					throw error;
				}
			}),

			abort: impl.threads.abort.handler(async ({ input }) => {
				await abortThread(ctx, input.threadId);
				return { threadId: input.threadId };
			}),

			commands: impl.threads.commands.handler(async ({ input }) => {
				return listThreadCommands(ctx, input.threadId);
			}),

			models: impl.threads.models.handler(async ({ input }) => {
				return listThreadModels(ctx, input.threadId);
			}),

			model: impl.threads.model.handler(async ({ input }) => {
				await logDashboardControl(ctx, {
					threadId: input.threadId,
					type: "model.select.request",
					source: "dashboard",
					data: { provider: input.provider, modelId: input.modelId },
				});
				try {
					const result = await selectThreadModel(ctx, input.threadId, input.provider, input.modelId);
					await logDashboardControl(ctx, {
						threadId: input.threadId,
						type: "model.select.success",
						source: "dashboard",
						data: { provider: input.provider, modelId: input.modelId, selectedAt: result.selectedAt },
					});
					return result;
				} catch (error) {
					await logDashboardControl(ctx, {
						threadId: input.threadId,
						type: "model.select.failed",
						source: "dashboard",
						level: "error",
						data: { provider: input.provider, modelId: input.modelId, ...errorData(error) },
					});
					throw error;
				}
			}),
		},

		lion: {
			state: impl.lion.state.handler(async () => {
				return ctx.lionState?.() ?? DEFAULT_LION_STATE;
			}),

			setStrategy: impl.lion.setStrategy.handler(async ({ input }) => {
				const previousStrategy = (ctx.lionState?.().strategy ?? "none") as LionStrategyName;
				const strategy = input.strategy;
				if (!ctx.setLionStrategy) {
					throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Lion strategy control is not available" });
				}
				try {
					await ctx.setLionStrategy(strategy);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					throw new ORPCError("BAD_REQUEST", { message });
				}
				return {
					strategy,
					previousStrategy,
					acceptedAt: Date.now(),
				};
			}),

			checklist: impl.lion.checklist.handler(async ({ input }) => {
				const kind = input.kind;
				if (kind !== "plan" && kind !== "review") {
					throw new ORPCError("BAD_REQUEST", { message: "Invalid checklist kind" });
				}
				const reference = input.reference;
				const state = ctx.lionState?.() ?? DEFAULT_LION_STATE;
				try {
					return ctx.checklistService.read({
						kind: kind as LionChecklistKind,
						reference,
						activePlanPath: state.activePlanPath,
						cwd: ctx.cwd,
					});
				} catch (error) {
					throw new ORPCError("NOT_FOUND", {
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}),
		},

		tasks: {
			list: impl.tasks.list.handler(async ({ input }) => {
				return ctx.taskService.list(input);
			}),

			get: impl.tasks.get.handler(async ({ input }) => {
				return ctx.taskService.get(input.id);
			}),

			create: impl.tasks.create.handler(async ({ input }) => {
				const { actorSessionId, ...taskInput } = input;
				return taskOrThrow(await ctx.taskService.create(taskInput, actorSessionId));
			}),

			update: impl.tasks.update.handler(async ({ input }) => {
				const { actorSessionId, ...taskInput } = input;
				return taskOrThrow(await ctx.taskService.update(taskInput, actorSessionId));
			}),

			complete: impl.tasks.complete.handler(async ({ input }) => {
				return taskOrThrow(await ctx.taskService.complete(input.id, input.expectedRevision, input.actorSessionId));
			}),

			block: impl.tasks.block.handler(async ({ input }) => {
				return taskOrThrow(
					await ctx.taskService.block(input.id, input.reason, input.expectedRevision, input.actorSessionId),
				);
			}),

			delete: impl.tasks.delete.handler(async ({ input }) => {
				return taskOrThrow(
					await ctx.taskService.softDelete(input.id, input.expectedRevision, input.actorSessionId),
				);
			}),
		},

		logs: {
			session: impl.logs.session.handler(async ({ input }) => {
				try {
					const sessionId = input.sessionId ?? (await resolveLogSessionId(ctx)) ?? undefined;
					return await ctx.logStore.query({ ...input, sessionId });
				} catch (error) {
					throw new ORPCError("SERVICE_UNAVAILABLE", {
						message: error instanceof Error ? error.message : "Dashboard logs are unavailable",
					});
				}
			}),

			list: impl.logs.list.handler(async () => {
				try {
					return await ctx.logStore.list();
				} catch (error) {
					throw new ORPCError("SERVICE_UNAVAILABLE", {
						message: error instanceof Error ? error.message : "Dashboard logs are unavailable",
					});
				}
			}),
		},
	});
}
