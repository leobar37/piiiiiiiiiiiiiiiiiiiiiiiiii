import { create } from "zustand";
import type { SubAgentEvent, SubAgentInstanceState } from "../types.ts";

interface SubAgentStore {
	agents: SubAgentInstanceState[];
	selectedAgentId: string | null;
	events: SubAgentEvent[];
	isConnected: boolean;

	setAgents: (agents: SubAgentInstanceState[]) => void;
	updateAgent: (agent: SubAgentInstanceState) => void;
	selectAgent: (id: string | null) => void;
	setEvents: (events: SubAgentEvent[]) => void;
	addEvent: (event: SubAgentEvent) => void;
	setConnected: (v: boolean) => void;
}

export const useSubAgentStore = create<SubAgentStore>((set) => ({
	agents: [],
	selectedAgentId: null,
	events: [],
	isConnected: false,

	setAgents: (agents) => set({ agents }),

	updateAgent: (agent) =>
		set((state) => ({
			agents: state.agents.map((a) => (a.instanceId === agent.instanceId ? agent : a)),
		})),

	selectAgent: (id) => set((state) => {
		if (id && id !== state.selectedAgentId) {
			window.location.hash = `#/agent/${id}`;
		} else if (!id) {
			window.location.hash = "#/";
		}
		return { selectedAgentId: id, events: id ? state.events : [] };
	}),

	setEvents: (events) => set({ events }),

	addEvent: (event) =>
		set((state) => {
			const nextAgents = state.agents.map((a) => {
				if (a.instanceId !== event.instanceId) return a;
				if (event.type === "instance.state") {
					return { ...(event as unknown as { state: SubAgentInstanceState }).state };
				}
				if (event.type === "lifecycle.change") {
					return { ...a, state: (event as unknown as { current: SubAgentInstanceState["state"] }).current };
				}
				if (event.type === "tool.start") {
					return {
						...a,
						currentTool: (event as unknown as { toolName: string }).toolName,
					};
				}
				if (event.type === "tool.end") {
					return { ...a, currentTool: null };
				}
				if (event.type === "turn.complete") {
					const te = event as unknown as { turnIndex: number; toolCount: number };
					return {
						...a,
						turnCount: Math.max(a.turnCount, te.turnIndex + 1),
						toolCount: a.toolCount + te.toolCount,
					};
				}
				if (event.type === "task.end" || event.type === "error") {
					return {
						...a,
						state: event.type === "error"
							? "failed"
							: (event as unknown as { result: { status: string } }).result.status === "completed"
								? "completed"
								: "failed" as SubAgentInstanceState["state"],
						currentTool: null,
					};
				}
				return a;
			});
			return {
				events: [...state.events, event],
				agents: nextAgents,
			};
		}),

	setConnected: (v) => set({ isConnected: v }),
}));
