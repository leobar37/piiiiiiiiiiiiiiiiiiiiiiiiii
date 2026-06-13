import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAgents } from "../../hooks/use-agents.ts";
import { useSubAgentStore } from "../../store/use-subagent-store.ts";

export const Route = createFileRoute("/_layout/")({
	component: IndexRoute,
});

function IndexRoute() {
	const router = useRouter();
	const { isLoading, error } = useAgents();
	const agents = useSubAgentStore((s) => s.agents);
	const mainThread = agents.find((agent) => agent.kind === "main") ?? null;

	useEffect(() => {
		if (mainThread) {
			void router.navigate({
				to: "/thread/$threadId",
				params: { threadId: mainThread.instanceId },
				replace: true,
			});
		}
	}, [mainThread, router]);

	return (
		<div className="flex h-full min-w-0 flex-1 items-center justify-center">
			<div className="text-center">
				<p className="text-lg font-medium text-text-primary">Pi Dashboard</p>
				<p className="text-sm text-text-muted mt-2">
					{isLoading ? "Loading live session..." : error ? "Error loading threads" : "Waiting for a main session..."}
				</p>
			</div>
		</div>
	);
}
