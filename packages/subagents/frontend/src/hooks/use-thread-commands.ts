import { skipToken, useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";

export function useThreadCommands(instanceId: string) {
	return useQuery(
		api.threads.commands.queryOptions({
			input: instanceId ? { threadId: instanceId } : skipToken,
		}),
	);
}
