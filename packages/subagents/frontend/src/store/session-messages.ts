import { create } from "zustand";
import type { ChatMessage, MessageBlock } from "../types.ts";
import { dashboardDebugLedger } from "../dev/debug-ledger.ts";

interface SessionMessagesState {
	messagesByInstance: Map<string, ChatMessage[]>;
	streamingByInstance: Map<string, boolean>;

	/** Replace all messages for an instance (initial hydration from REST) */
	setMessages: (instanceId: string, messages: ChatMessage[]) => void;
	/** Append a new message or update by message.id */
	addMessage: (instanceId: string, message: ChatMessage) => void;
	/** Mark a message as partial+streaming (start of SSE stream) */
	startMessage: (instanceId: string, message: ChatMessage) => void;
	/** Update a partial streaming message in-place */
	updatePartialMessage: (instanceId: string, message: ChatMessage) => void;
	/** Mark a partial message as complete */
	finishMessage: (instanceId: string, message: ChatMessage) => void;
	/** Update blocks on an existing message by messageId */
	updateMessageBlocks: (instanceId: string, messageId: string, blocks: MessageBlock[]) => void;
	/** Set streaming state for an instance */
	setStreaming: (instanceId: string, streaming: boolean) => void;
	getMessages: (instanceId: string) => ChatMessage[];
	clearMessages: (instanceId: string) => void;
}

export const useSessionMessagesStore = create<SessionMessagesState>((set, get) => ({
	messagesByInstance: new Map(),
	streamingByInstance: new Map(),

	setMessages: (instanceId, messages) =>
		set((state) => {
			const next = new Map(state.messagesByInstance);
			next.set(instanceId, messages);
			dashboardDebugLedger.recordMessages(instanceId, messages, "hydrate");
			return { messagesByInstance: next };
		}),

	addMessage: (instanceId, message) =>
		set((state) => {
			const next = new Map(state.messagesByInstance);
			const existing = next.get(instanceId) ?? [];
			// Deduplicate by message.id
			const idx = existing.findIndex((m) => m.id === message.id);
			if (idx >= 0) {
				existing[idx] = message;
			} else {
				existing.push(message);
			}
			next.set(instanceId, [...existing]);
			dashboardDebugLedger.recordMessages(instanceId, next.get(instanceId) ?? [], "add");
			return { messagesByInstance: next };
		}),

	startMessage: (instanceId, message) =>
		set((state) => {
			const next = new Map(state.messagesByInstance);
			const existing = next.get(instanceId) ?? [];
			const partialMessage = { ...message, partial: true, streaming: message.role === "assistant" };
			const idx = existing.findIndex((m) => m.id === message.id);
			if (idx >= 0) {
				existing[idx] = partialMessage;
			} else {
				existing.push(partialMessage);
			}
			next.set(instanceId, [...existing]);
			dashboardDebugLedger.recordMessages(instanceId, next.get(instanceId) ?? [], "start");
			return { messagesByInstance: next };
		}),

	updatePartialMessage: (instanceId, message) =>
		set((state) => {
			const next = new Map(state.messagesByInstance);
			const existing = next.get(instanceId) ?? [];
			const idx = existing.findIndex((m) => m.id === message.id);
			const partialMessage = { ...message, partial: true, streaming: message.role === "assistant" };
			if (idx >= 0) {
				existing[idx] = partialMessage;
			} else {
				existing.push(partialMessage);
			}
			next.set(instanceId, [...existing]);
			dashboardDebugLedger.recordMessages(instanceId, next.get(instanceId) ?? [], "update-partial");
			return { messagesByInstance: next };
		}),

	finishMessage: (instanceId, message) =>
		set((state) => {
			const next = new Map(state.messagesByInstance);
			const existing = next.get(instanceId) ?? [];
			const idx = existing.findIndex((m) => m.id === message.id);
			const finalMessage = { ...message, partial: false, streaming: false };
			if (idx >= 0) {
				existing[idx] = finalMessage;
			} else {
				existing.push(finalMessage);
			}
			next.set(instanceId, [...existing]);
			dashboardDebugLedger.recordMessages(instanceId, next.get(instanceId) ?? [], "finish");
			return { messagesByInstance: next };
		}),

	updateMessageBlocks: (instanceId, messageId, blocks) =>
		set((state) => {
			const next = new Map(state.messagesByInstance);
			const existing = next.get(instanceId) ?? [];
			next.set(
				instanceId,
				existing.map((m) => (m.id === messageId ? { ...m, blocks } : m)),
			);
			dashboardDebugLedger.recordMessages(instanceId, next.get(instanceId) ?? [], "update-blocks");
			return { messagesByInstance: next };
		}),

	setStreaming: (instanceId, streaming) =>
		set((state) => {
			const next = new Map(state.streamingByInstance);
			next.set(instanceId, streaming);
			dashboardDebugLedger.log("debug", "messages", "streaming", { streaming }, instanceId);
			return { streamingByInstance: next };
		}),

	getMessages: (instanceId) => {
		return get().messagesByInstance.get(instanceId) ?? [];
	},

	clearMessages: (instanceId) =>
		set((state) => {
			const next = new Map(state.messagesByInstance);
			next.delete(instanceId);
			const streamingNext = new Map(state.streamingByInstance);
			streamingNext.delete(instanceId);
			dashboardDebugLedger.log("debug", "messages", "clear", undefined, instanceId);
			return { messagesByInstance: next, streamingByInstance: streamingNext };
		}),
}));
