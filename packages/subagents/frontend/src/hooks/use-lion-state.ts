import { useQuery } from "@tanstack/react-query";
import { fetchLionState } from "../api.ts";

export function useLionState() {
	return useQuery({
		queryKey: ["lion-state"],
		queryFn: fetchLionState,
		refetchInterval: 2000,
	});
}
