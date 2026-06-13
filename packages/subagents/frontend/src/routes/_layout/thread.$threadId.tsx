import { createFileRoute } from "@tanstack/react-router";
import { AgentDetail } from "../../components/AgentDetail.tsx";
import { navigateToThread } from "../../navigation.ts";
import { useSubAgentStore } from "../../store/use-subagent-store.ts";

export const Route = createFileRoute("/_layout/thread/$threadId")({
	component: ThreadRoute,
});

function ThreadRoute() {
	const { threadId } = Route.useParams();
	const mainThread = useSubAgentStore((s) => s.agents.find((agent) => agent.kind === "main")) ?? null;

	return (
		<AgentDetail
			instanceId={threadId}
			onBack={() => navigateToThread(mainThread?.instanceId ?? null)}
		/>
	);
}
