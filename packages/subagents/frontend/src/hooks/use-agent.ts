import { skipToken, useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";

export function useAgent(instanceId: string) {
	return useQuery(
		api.threads.get.queryOptions({
			input: instanceId ? { threadId: instanceId } : skipToken,
		}),
	);
}
