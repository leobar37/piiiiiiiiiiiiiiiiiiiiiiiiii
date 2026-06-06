import { skipToken, useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import { convertAgentMessages } from "../utils/message-converter.ts";

export function useAgentMessages(instanceId: string) {
	return useQuery({
		...api.threads.messages.queryOptions({
			input: instanceId ? { threadId: instanceId } : skipToken,
		}),
		select: (data) => convertAgentMessages(instanceId, data as Array<Record<string, unknown>>),
	});
}
