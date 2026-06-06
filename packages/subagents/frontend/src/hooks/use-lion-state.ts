import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";

export function useLionState() {
	return useQuery({
		...api.lion.state.queryOptions(),
		refetchInterval: 2000,
	});
}
