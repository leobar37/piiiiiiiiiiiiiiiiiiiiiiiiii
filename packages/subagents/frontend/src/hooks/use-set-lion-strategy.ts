import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, orpc } from "../api/client.ts";
import type { LionDashboardState } from "../types.ts";

export type LionStrategyName = LionDashboardState["strategy"];

export function useSetLionStrategy() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: { strategy: LionStrategyName }) => orpc.lion.setStrategy(input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: api.lion.state.queryOptions().queryKey });
		},
	});
}
