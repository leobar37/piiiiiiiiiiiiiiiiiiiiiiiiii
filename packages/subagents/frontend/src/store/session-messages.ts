import { create } from "zustand";
import type { ChatMessage, MessageBlock } from "../types.ts";

interface SessionMessagesState {
	messagesByInstance: Map<string, ChatMessage[]>;
	streamingByInstance: Map<string, boolean>;
	
	setMessages: (instanceId: string, messages: ChatMessage[]) => void;
	addMessage: (instanceId: string, message: ChatMessage) => void;
	updateMessageBlocks: (instanceId: string, messageId: string, blocks: MessageBlock[]) => void;
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
			return { messagesByInstance: next };
		}),

	addMessage: (instanceId, message) =>
		set((state) => {
			const next = new Map(state.messagesByInstance);
			const existing = next.get(instanceId) ?? [];
			next.set(instanceId, [...existing, message]);
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
			return { messagesByInstance: next };
		}),

	setStreaming: (instanceId, streaming) =>
		set((state) => {
			const next = new Map(state.streamingByInstance);
			next.set(instanceId, streaming);
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
			return { messagesByInstance: next, streamingByInstance: streamingNext };
		}),
}));
