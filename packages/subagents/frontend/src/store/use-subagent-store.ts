import { create } from "zustand";
import type { LionChecklistSnapshot, SubAgentEvent, SubAgentInstanceState } from "../types.ts";
import { navigateToThread } from "../navigation.ts";

interface SubAgentStore {
	agents: SubAgentInstanceState[];
	selectedAgentId: string | null;
	events: SubAgentEvent[];
	checklistsByKey: Record<string, LionChecklistSnapshot>;
	openChecklistKey: string | null;
	isConnected: boolean;

	setAgents: (agents: SubAgentInstanceState[]) => void;
	updateAgent: (agent: SubAgentInstanceState) => void;
	selectAgent: (id: string | null) => void;
	setEvents: (events: SubAgentEvent[]) => void;
	mergeEvents: (events: SubAgentEvent[]) => void;
	addEvent: (event: SubAgentEvent) => void;
	upsertChecklist: (checklist: LionChecklistSnapshot) => void;
	openChecklist: (key: string | null) => void;
	setConnected: (v: boolean) => void;
}

export const useSubAgentStore = create<SubAgentStore>((set) => ({
	agents: [],
	selectedAgentId: null,
	events: [],
	checklistsByKey: {},
	openChecklistKey: null,
	isConnected: false,

	setAgents: (agents) => set({ agents }),

	updateAgent: (agent) =>
		set((state) => ({
			agents: state.agents.map((a) => (a.instanceId === agent.instanceId ? agent : a)),
		})),

	selectAgent: (id) => set((state) => {
		if (id && id !== state.selectedAgentId) {
			navigateToThread(id);
		} else if (!id) {
			navigateToThread(null);
		}
		return { selectedAgentId: id, events: id ? state.events : [] };
	}),

	setEvents: (events) => set({ events }),

	mergeEvents: (events) =>
		set((state) => {
			const seen = new Set(state.events.map((e) => `${e.timestamp}-${e.type}-${e.instanceId}`));
			const newEvents = events.filter((e) => !seen.has(`${e.timestamp}-${e.type}-${e.instanceId}`));
			const merged = [...state.events, ...newEvents];
			merged.sort((a, b) => a.timestamp - b.timestamp);
			return { events: merged };
		}),

	addEvent: (event) =>
		set((state) => {
			// Lightweight dedup: skip if last event is identical (timestamp + type + instanceId)
			const last = state.events[state.events.length - 1];
			if (
				last &&
				last.type === event.type &&
				last.instanceId === event.instanceId &&
				last.timestamp === event.timestamp
			) {
				// Guard against different events sharing the same ms by comparing full shape
				if (JSON.stringify(last) === JSON.stringify(event)) return state;
			}

			// Handle new agents arriving via instance.created
			if (event.type === "instance.created") {
				const ce = event as unknown as {
					instanceId: string;
					taskId: string;
					definitionName: string;
					cwd?: string;
					kind?: SubAgentInstanceState["kind"];
					parentThreadId?: string;
					parentToolCallId?: string;
					runId?: string;
					runIndex?: number;
				};
				if (!state.agents.find((a) => a.instanceId === ce.instanceId)) {
					const newAgent: SubAgentInstanceState = {
						instanceId: ce.instanceId,
						taskId: ce.taskId,
						definitionName: ce.definitionName,
						cwd: ce.cwd ?? "",
						kind: ce.kind ?? "subagent",
						parentThreadId: ce.parentThreadId,
						parentToolCallId: ce.parentToolCallId,
						runId: ce.runId,
						runIndex: ce.runIndex,
						description: "",
						state: "created",
						startTime: null,
						endTime: null,
						turnCount: 0,
						lastActivityAt: Date.now(),
						currentTool: null,
						error: null,
						toolCount: 0,
						currentToolStartedAt: null,
						durationMs: 0,
					};
					return {
						events: [...state.events, event],
						agents: [...state.agents, newAgent],
					};
				}
			}

			if (event.type === "instance.state") {
				const nextState = (event as unknown as { state: SubAgentInstanceState }).state;
				if (!state.agents.find((a) => a.instanceId === nextState.instanceId)) {
					return {
						events: [...state.events, event],
						agents: [...state.agents, nextState],
					};
				}
			}

			if (event.type.startsWith("lion.checklist.")) {
				const checklist = (event as unknown as { checklist?: LionChecklistSnapshot }).checklist;
				if (checklist) {
					return {
						events: [...state.events, event],
						checklistsByKey: {
							...state.checklistsByKey,
							[checklistKey(checklist)]: checklist,
						},
					};
				}
			}

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

	upsertChecklist: (checklist) =>
		set((state) => ({
			checklistsByKey: {
				...state.checklistsByKey,
				[checklistKey(checklist)]: checklist,
			},
		})),

	openChecklist: (key) => set({ openChecklistKey: key }),

	setConnected: (v) => set({ isConnected: v }),
}));

export function checklistKey(checklist: LionChecklistSnapshot): string {
	return `${checklist.kind}:${checklist.rootPath}`;
}
