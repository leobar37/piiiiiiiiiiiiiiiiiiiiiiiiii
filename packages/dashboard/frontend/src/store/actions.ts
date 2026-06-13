import { orpc } from "../orpc.js";
import type { ModelInfo } from "../api-types.js";
import type { SessionRuntime, ChatMessage } from "./runtime.js";
import type { OptimisticManager } from "./optimistic.js";
import { generateMessageId } from "./utils.js";
import { normalizeMessageContent } from "./message-blocks.js";

export function createActions(runtime: SessionRuntime, optimistic: OptimisticManager) {
	return {
		async loadSessions(projectId?: string) {
			const result = await orpc.sessions.list(projectId ? { projectId, scope: "project" } : { scope: "global" });
			const incomingIds = new Set(result.sessions.map((info) => info.id));
			for (const info of result.sessions) {
				const entry = {
					info,
					streaming: info.status === "streaming",
					compacting: false,
					pendingMessages: 0,
				};
				runtime.store.set(runtime.maps.sessions.mapAtom, { type: "set", key: info.id, value: entry });
			}
			const currentSessions = runtime.store.get(runtime.maps.sessions.mapAtom);
			for (const [sessionId, entry] of currentSessions) {
				const isInLoadedScope = projectId ? entry.info.projectId === projectId : true;
				if (isInLoadedScope && !incomingIds.has(sessionId)) {
					runtime.store.set(runtime.maps.sessions.mapAtom, { type: "delete", key: sessionId });
				}
			}
			return result.sessions;
		},

		async createSession(projectId: string, cwd?: string) {
			const result = await orpc.sessions.create({ projectId, cwd });
			const entry = {
				info: result.session,
				streaming: false,
				compacting: false,
				pendingMessages: 0,
			};
			runtime.store.set(runtime.maps.sessions.mapAtom, {
				type: "set",
				key: result.session.id,
				value: entry,
			});
			return result.session;
		},

		async removeSession(sessionId: string) {
			await orpc.sessions.remove({ sessionId });
			runtime.store.set(runtime.maps.sessions.mapAtom, { type: "delete", key: sessionId });
		},

		async startSession(sessionId: string) {
			await orpc.sessions.start({ sessionId });
		},

		async stopSession(sessionId: string) {
			await orpc.sessions.stop({ sessionId });
		},

		async prompt(sessionId: string, message: string) {
			const tempId = optimistic.addPendingMessage(sessionId, message);
			try {
				await orpc.sessions.prompt({ sessionId, message });
				// The backend will emit the user message via SSE.
				// The optimistic message is kept until the server echo arrives,
				// at which point handleMessageStart resolves it.
			} catch (err) {
				optimistic.rollbackMessage(tempId);
				throw err;
			}
		},

		async steer(sessionId: string, message: string) {
			const tempId = optimistic.addPendingMessage(sessionId, message);
			try {
				await orpc.sessions.steer({ sessionId, message });
				// Same as prompt — server echo will resolve the optimistic message.
			} catch (err) {
				optimistic.rollbackMessage(tempId);
				throw err;
			}
		},

		async abort(sessionId: string) {
			await orpc.sessions.abort({ sessionId });
		},

		async loadMessages(sessionId: string) {
			const result = await orpc.sessions.messages.get({ sessionId });
			// Clear existing messages for this session to avoid duplicates on reload
			const existingIds = runtime.store.get(runtime.indexes.messagesBySession.atomFor(sessionId));
			for (const id of existingIds) {
				runtime.store.set(runtime.maps.messages.mapAtom, { type: "delete", key: id });
			}
			const messages = result.messages.map((m) => ({
				id: generateMessageId(),
				sessionId,
				role: ((m.role as string) ?? "custom") as ChatMessage["role"],
				blocks: normalizeMessageContent(m),
				timestamp: (m.timestamp as number) ?? Date.now(),
				streaming: false,
			}));
			for (const msg of messages) {
				runtime.store.set(runtime.maps.messages.mapAtom, { type: "set", key: msg.id, value: msg });
			}
			return messages;
		},

		async loadAvailableModels(sessionId?: string): Promise<ModelInfo[]> {
			const result = await orpc.sessions.models.list({ sessionId });
			return result.models;
		},

		async setSessionModel(sessionId: string, provider: string, modelId: string): Promise<void> {
			await orpc.sessions.models.set({ sessionId, provider, modelId });
		},
	};
}
