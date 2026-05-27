import { useState, useEffect } from "react";
import { AgentList } from "./components/AgentList.tsx";
import { AgentDetail } from "./components/AgentDetail.tsx";

function getHashAgentId(): string | null {
	const hash = window.location.hash;
	return hash.startsWith("#/agent/") ? hash.slice("#/agent/".length) : null;
}

function useHashAgentId(): string | null {
	const [id, setId] = useState(() => getHashAgentId());

	useEffect(() => {
		const handler = () => setId(getHashAgentId());
		window.addEventListener("hashchange", handler);
		return () => window.removeEventListener("hashchange", handler);
	}, []);

	return id;
}

export function navigateToAgent(id: string | null) {
	window.location.hash = id ? `#/agent/${id}` : "#/";
}

export default function App() {
	const agentId = useHashAgentId();

	return (
		<div className="h-screen flex bg-bg-base text-text-primary overflow-hidden">
			<aside className="w-80 shrink-0 border-r border-border-subtle">
				<AgentList />
			</aside>
			<main className="flex-1 flex flex-col min-w-0">
				{agentId ? (
					<AgentDetail
						instanceId={agentId}
						onBack={() => navigateToAgent(null)}
					/>
				) : (
					<div className="flex items-center justify-center h-full">
						<div className="text-center">
							<p className="text-lg font-medium text-text-primary">
								SubAgent Dashboard
							</p>
							<p className="text-sm text-text-muted mt-2">
								Select an agent from the sidebar to view live events
							</p>
						</div>
					</div>
				)}
			</main>
		</div>
	);
}
