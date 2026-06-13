import type { QueryClient } from "@tanstack/react-query";
import { api } from "../api/client.ts";

export function getTaskListQueryKey(includeDeleted: boolean) {
	return api.tasks.list.queryOptions({ input: { includeDeleted } }).queryKey;
}

export function invalidateTaskQueries(queryClient: QueryClient): void {
	void queryClient.invalidateQueries({ queryKey: getTaskListQueryKey(false) });
	void queryClient.invalidateQueries({ queryKey: getTaskListQueryKey(true) });
}
