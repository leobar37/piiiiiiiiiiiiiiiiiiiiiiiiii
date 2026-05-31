import { useState, useEffect } from "react";
import { AgentDetail } from "./components/AgentDetail.tsx";
import { useAgents } from "./hooks/use-agents.ts";
import { useSseEvents } from "./hooks/use-sse.ts";
import { navigateToThread, getHashThreadId } from "./navigation.ts";
import { useSubAgentStore } from "./store/use-subagent-store.ts";
import { SubagentListPanel } from "./components/SubagentListPanel.tsx";

function useHashThreadId(): string | null {
	const [id, setId] = useState(() => getHashThreadId());

	useEffect(() => {
		const handler = () => setId(getHashThreadId());
		window.addEventListener("hashchange", handler);
		return () => window.removeEventListener("hashchange", handler);
	}, []);

	return id;
}

export default function App() {
	const threadId = useHashThreadId();
	const { data: fetchedAgents, isLoading, error } = useAgents();
	const agents = useSubAgentStore((s) => s.agents);
	const setAgents = useSubAgentStore((s) => s.setAgents);

	useSseEvents();

	useEffect(() => {
		if (fetchedAgents) {
			setAgents(fetchedAgents);
		}
	}, [fetchedAgents, setAgents]);

	const mainThread = agents.find((agent) => agent.kind === "main") ?? null;

	useEffect(() => {
		if (!threadId && mainThread) {
			navigateToThread(mainThread.instanceId);
		}
	}, [mainThread, threadId]);

	const activeThreadId = threadId ?? mainThread?.instanceId ?? null;

	return (
		<div className="h-screen bg-bg-base text-text-primary overflow-hidden">
			<main className="flex h-full min-w-0">
				<SubagentListPanel activeThreadId={activeThreadId} />
				{activeThreadId ? (
					<AgentDetail
						instanceId={activeThreadId}
						onBack={() => navigateToThread(mainThread?.instanceId ?? null)}
					/>
				) : (
					<div className="flex h-full min-w-0 flex-1 items-center justify-center">
						<div className="text-center">
							<p className="text-lg font-medium text-text-primary">
								Lion Dashboard
							</p>
							<p className="text-sm text-text-muted mt-2">
								{isLoading ? "Loading live session..." : error ? "Error loading threads" : "Waiting for a main session..."}
							</p>
						</div>
					</div>
				)}
			</main>
		</div>
	);
}
