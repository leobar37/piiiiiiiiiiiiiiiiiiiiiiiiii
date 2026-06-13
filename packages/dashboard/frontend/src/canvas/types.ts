import type { Node } from "@xyflow/react";

export interface CanvasSession {
	id: string;
	name: string;
	createdAt: number;
	projectId?: string;
	cwd?: string;
	/** Optional thread ID in the subagents backend. Falls back to the canvas session ID. */
	threadId?: string;
}

export interface AgentCanvasNodeData {
	session: CanvasSession;
	backendUrl: string;
	focused: boolean;
	onFocus: (sessionId: string) => void;
	onOpen: (sessionId: string) => void;
	[key: string]: unknown;
}

export type AgentCanvasNode = Node<AgentCanvasNodeData, "agentSession">;
