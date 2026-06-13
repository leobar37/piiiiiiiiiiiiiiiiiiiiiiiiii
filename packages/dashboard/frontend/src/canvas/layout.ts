import type { AgentCanvasNode, CanvasSession } from "./types.js";

const NODE_WIDTH = 760;
const NODE_HEIGHT = 560;
const GAP_X = 120;
const GAP_Y = 90;
const COLUMNS = 2;
const NODE_SIZES_KEY = "pi-dashboard:agent-canvas:sizes";

type SavedSizes = Record<string, { width: number; height: number }>;

function loadSavedSizes(): SavedSizes {
	try {
		const raw = window.localStorage.getItem(NODE_SIZES_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") return {};
		return parsed as SavedSizes;
	} catch {
		return {};
	}
}

export function createSessionNodes(
	sessions: CanvasSession[],
	activeSessionId: string | null,
	focusedSessionId: string | null,
	backendUrl: string,
	onFocus: (sessionId: string) => void,
	onOpen: (sessionId: string) => void,
): AgentCanvasNode[] {
	const savedSizes = loadSavedSizes();
	return sessions.map((session, index) => {
		const column = index % COLUMNS;
		const row = Math.floor(index / COLUMNS);
		const id = session.id;
		const savedSize = savedSizes[id];

		return {
			id,
			type: "agentSession",
			width: savedSize?.width ?? NODE_WIDTH,
			height: savedSize?.height ?? NODE_HEIGHT,
			style: {
				width: savedSize?.width ?? NODE_WIDTH,
				height: savedSize?.height ?? NODE_HEIGHT,
			},
			position: {
				x: column * (NODE_WIDTH + GAP_X),
				y: row * (NODE_HEIGHT + GAP_Y),
			},
			data: {
				session,
				backendUrl,
				focused: id === focusedSessionId || id === activeSessionId,
				onFocus,
				onOpen,
			},
			dragHandle: ".agent-node-drag-handle",
		};
	});
}
