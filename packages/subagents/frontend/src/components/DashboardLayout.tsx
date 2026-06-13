import type { ReactNode } from "react";
import { useEffect } from "react";
import { ChecklistDrawer } from "./ChecklistDrawer.tsx";
import { SubagentListPanel } from "./SubagentListPanel.tsx";
import { useAgents } from "../hooks/use-agents.ts";
import { useSseEvents } from "../hooks/use-sse.ts";
import { useSubAgentStore } from "../store/use-subagent-store.ts";

interface DashboardLayoutProps {
	activeThreadId: string | null;
	children: ReactNode;
}

export function DashboardLayout({ activeThreadId, children }: DashboardLayoutProps) {
	const { data: fetchedAgents } = useAgents();
	const setAgents = useSubAgentStore((s) => s.setAgents);

	useSseEvents();

	useEffect(() => {
		if (fetchedAgents) {
			setAgents(fetchedAgents);
		}
	}, [fetchedAgents, setAgents]);

	return (
		<div className="h-screen bg-bg-base text-text-primary overflow-hidden">
			<main className="flex h-full min-w-0">
				<SubagentListPanel activeThreadId={activeThreadId} />
				{children}
			</main>
			<ChecklistDrawer />
		</div>
	);
}
