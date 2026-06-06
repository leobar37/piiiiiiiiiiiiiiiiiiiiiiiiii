import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../api/client.ts";
import { useSessionMessagesStore } from "../store/session-messages.ts";
import type { ChatMessage } from "../types.ts";

export type ComposerMode = "prompt" | "follow_up" | "steer";

export interface SendThreadMessageInput {
	threadId: string;
	message: string;
	mode: ComposerMode;
}

export function useSendThreadMessage() {
	const queryClient = useQueryClient();
	const addMessage = useSessionMessagesStore((state) => state.addMessage);

		return useMutation({
			mutationFn: (input: SendThreadMessageInput) => orpc.threads.prompt(input),
		onMutate: (input) => {
			const optimistic: ChatMessage = {
				id: `optimistic-${input.threadId}-${Date.now()}`,
				instanceId: input.threadId,
				role: "user",
				blocks: [{ type: "text", text: input.message }],
				timestamp: Date.now(),
			};
			addMessage(input.threadId, optimistic);
		},
			onSettled: (_data, _error, input) => {
				void queryClient.invalidateQueries(
					api.threads.messages.queryOptions({
						input: { threadId: input.threadId },
					}),
				);
			},
		});
	}
