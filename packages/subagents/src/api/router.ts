import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { implement, ORPCError } from "@orpc/server";
import type { LionChecklistKind } from "../lion/types.js";
import type { VirtualInstance } from "../transport/state-manager.js";
import type { DashboardLionState, DashboardThreadState } from "../transport/types.js";
import type { SubAgentRunRecord, SubAgentState } from "../types.js";
import type { SubagentsApiContext } from "./context.js";
import { subagentsContract } from "./contract.js";
import { getAgentSessionCommands, sendToAgentSession, type ThreadPromptMode } from "./session-control.js";
import type { SubagentsOutputs } from "./types.js";

const DEFAULT_LION_STATE: DashboardLionState = {
	active: false,
	strategy: "plan",
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
): Promise<void> {
	const main = ctx.mainSession?.getThread();
	if (main?.instanceId === threadId) {
		if (!ctx.mainSession?.sendMessage) {
			throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Main session is not controllable" });
		}
		await ctx.mainSession.sendMessage(threadId, message, mode);
		return;
	}

	const instance = ctx.controller.getInstanceById(threadId);
	if (instance) {
		const state = instance.getState();
		if (state.state === "created" || state.state === "starting") {
			throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Session not ready" });
		}
		if (mode === "follow_up") {
			await ctx.controller.instanceFollowUp(state.taskId, message);
		} else if (mode === "steer") {
			await ctx.controller.steerInstance(state.taskId, message);
		} else {
			await ctx.controller.promptInstance(state.taskId, message);
		}
		return;
	}

	const resumable = await getVirtualSessionFile(ctx, threadId);
	if (resumable) {
		try {
			const cached = await ctx.sessionCache.getOrCreate(resumable.record, resumable.sessionFile);
			await sendToAgentSession(cached.session, message, mode);
			return;
		} catch (error) {
			throw new ORPCError("SERVICE_UNAVAILABLE", {
				message: error instanceof Error ? error.message : "Session not resumable",
			});
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
		return ctx.mainSession?.getCommands?.(threadId) ?? [];
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

	throw new ORPCError("NOT_FOUND", { message: "Thread not found" });
}

export function createSubagentsRouter(ctx: SubagentsApiContext) {
	const impl = implement(subagentsContract).$context<SubagentsApiContext>();

	return impl.router({
		threads: {
			list: impl.threads.list.handler(async () => {
				const main = ctx.mainSession?.getThread();
				const subagents = await getSubagentThreads(ctx);
				const threads = main ? [main, ...subagents] : subagents;
				return threads;
			}),

			get: impl.threads.get.handler(async ({ input }) => {
				const threadId = input.threadId;
				const main = ctx.mainSession?.getThread();
				if (main?.instanceId === threadId) {
					return main;
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
				await sendThreadMessage(ctx, input.threadId, input.message, input.mode);
				return {
					threadId: input.threadId,
					mode: input.mode,
					status: "sent" as const,
					acceptedAt: Date.now(),
				};
			}),

			commands: impl.threads.commands.handler(async ({ input }) => {
				return listThreadCommands(ctx, input.threadId);
			}),
		},

		lion: {
			state: impl.lion.state.handler(async () => {
				return ctx.lionState?.() ?? DEFAULT_LION_STATE;
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
	});
}
