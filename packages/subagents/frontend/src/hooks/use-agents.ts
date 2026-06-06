import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";

export function useAgents() {
	return useQuery(api.threads.list.queryOptions());
}
