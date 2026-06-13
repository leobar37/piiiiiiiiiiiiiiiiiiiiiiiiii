import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../api/client.ts";
import { invalidateThreadMessages, updateThreadMessagesCache } from "../lib/thread-message-cache.ts";
import { useSessionMessagesStore } from "../store/session-messages.ts";
import type { ChatMessage, DashboardImageAttachment, MessageBlock } from "../types.ts";

export type ComposerMode = "prompt" | "follow_up" | "steer";

export interface SendThreadMessageInput {
	threadId: string;
	message: string;
	mode: ComposerMode;
	images?: DashboardImageAttachment[];
}

export function useSendThreadMessage() {
	const queryClient = useQueryClient();
	const addMessage = useSessionMessagesStore((state) => state.addMessage);
	const removeMessage = useSessionMessagesStore((state) => state.removeMessage);

	return useMutation({
		mutationFn: (input: SendThreadMessageInput) => orpc.threads.prompt(input),
		onMutate: (input) => {
			const optimisticId = `optimistic-${input.threadId}-${Date.now()}`;
			const optimistic: ChatMessage = {
				id: optimisticId,
				instanceId: input.threadId,
				role: "user",
				blocks: createOptimisticBlocks(input.message, input.images),
				timestamp: Date.now(),
				optimistic: true,
			};
			addMessage(input.threadId, optimistic);
			updateThreadMessagesCache(queryClient, input.threadId, (current) => [...(current ?? []), optimistic]);
			return { optimisticId };
		},
		onError: (_error, input, context) => {
			if (!context?.optimisticId) return;
			removeMessage(input.threadId, context.optimisticId);
			updateThreadMessagesCache(queryClient, input.threadId, (current) =>
				(current ?? []).filter((message) => message.id !== context.optimisticId),
			);
		},
		onSettled: (_data, _error, input) => {
			invalidateThreadMessages(queryClient, input.threadId);
		},
	});
}

function createOptimisticBlocks(message: string, images: DashboardImageAttachment[] | undefined): MessageBlock[] {
	const blocks: MessageBlock[] = [{ type: "text", text: message }];
	for (const image of images ?? []) {
		blocks.push({ type: "image", data: image.data, mimeType: image.mimeType });
	}
	return blocks;
}
