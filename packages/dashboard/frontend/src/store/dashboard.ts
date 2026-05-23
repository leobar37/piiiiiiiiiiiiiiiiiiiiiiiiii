import { create } from "zustand";

// Local type mirror of the dashboard API contract
export interface DashboardEventPayload {
	id: string;
	type: string;
	source: "lion" | "subagent";
	payload: unknown;
	timestamp: number;
	runId?: string;
	planSlug?: string;
	planPath?: string;
	taskId?: string;
	attempt?: number;
}

export interface LionDashboardState {
	active: boolean;
	mode: "planning" | "building" | null;
	activePlan: { slug: string | null; path: string | null; kind: string | null } | null;
	activeTask: { id: string | null; title: string | null; status: string } | null;
	activeRun: { runId: string | null; status: string; attempt: number } | null;
	subagents: Array<{
		taskId: string;
		role: string;
		status: string;
		turnCount: number;
		currentTool: string | null;
		summary: string | null;
		startedAt: number;
		updatedAt: number;
	}>;
	runHistory: Array<{
		runId: string;
		planSlug: string;
		taskTitle: string;
		status: string;
		attempts: number;
		createdAt: number;
	}>;
}

export interface DashboardState {
	uptime: number;
	bridgeCount: number;
	subscriberCount: number;
	recentEvents: DashboardEventPayload[];
	lion: LionDashboardState | null;
}

interface DashboardStoreState {
	connected: boolean;
	error: string | null;
	events: DashboardEventPayload[];
	maxEvents: number;
	addEvent: (event: DashboardEventPayload) => void;
	clearEvents: () => void;
	uptime: number;
	bridgeCount: number;
	lionState: LionDashboardState | null;
	setConnected: (connected: boolean) => void;
	setServerInfo: (uptime: number, bridgeCount: number) => void;
	setLionState: (state: LionDashboardState | null) => void;
	sourceFilter: "all" | "lion" | "subagent";
	setSourceFilter: (filter: "all" | "lion" | "subagent") => void;
	typeFilter: string | null;
	setTypeFilter: (type: string | null) => void;
}

export const useDashboardStore = create<DashboardStoreState>((set) => ({
	connected: false,
	error: null,
	events: [],
	maxEvents: 500,
	addEvent: (event) =>
		set((state) => {
			const next = [...state.events, event];
			if (next.length > state.maxEvents) {
				next.shift();
			}
			return { events: next };
		}),
	clearEvents: () => set({ events: [] }),
	uptime: 0,
	bridgeCount: 0,
	lionState: null,
	setConnected: (connected: boolean) => set({ connected }),
	setServerInfo: (uptime, bridgeCount) => set({ uptime, bridgeCount }),
	setLionState: (lionState) => set({ lionState }),
	sourceFilter: "all",
	setSourceFilter: (filter) => set({ sourceFilter: filter }),
	typeFilter: null,
	setTypeFilter: (type) => set({ typeFilter: type }),
}));
