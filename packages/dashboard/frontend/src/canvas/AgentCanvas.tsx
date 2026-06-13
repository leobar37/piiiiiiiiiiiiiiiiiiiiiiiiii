import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Background,
	Controls,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	type NodeMouseHandler,
	type NodeChange,
	useEdgesState,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";
import { AgentSessionNode } from "./AgentSessionNode.js";
import { createSessionNodes } from "./layout.js";
import type { AgentCanvasNode, CanvasSession } from "./types.js";

interface AgentCanvasProps {
	sessions: CanvasSession[];
	backendUrl: string;
	focusedSessionId: string | null;
	onFocusSession: (sessionId: string) => void;
	onOpenSession: (sessionId: string) => void;
	onCreateSession: () => void;
	canCreateSession: boolean;
	onRemoveSession: (sessionId: string) => void;
}

const nodeTypes = {
	agentSession: AgentSessionNode,
};

const CANVAS_POSITIONS_KEY = "pi-dashboard:agent-canvas:positions";

type SavedPositions = Record<string, { x: number; y: number }>;

function loadSavedPositions(): SavedPositions {
	try {
		const raw = window.localStorage.getItem(CANVAS_POSITIONS_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") return {};
		return parsed as SavedPositions;
	} catch {
		return {};
	}
}

function savePositions(nodes: AgentCanvasNode[]): void {
	const positions: SavedPositions = {};
	for (const node of nodes) {
		positions[node.id] = node.position;
	}
	window.localStorage.setItem(CANVAS_POSITIONS_KEY, JSON.stringify(positions));
}

interface FlowCanvasProps {
	sessions: CanvasSession[];
	backendUrl: string;
	focusedSessionId: string | null;
	onFocusSession: (sessionId: string) => void;
}

function FlowCanvas({
	sessions,
	backendUrl,
	focusedSessionId,
	onFocusSession,
}: FlowCanvasProps) {
	const { fitView } = useReactFlow<AgentCanvasNode>();

	const handleOpenNode = useCallback(
		(nodeId: string) => {
			onFocusSession(nodeId);
			void fitView({
				nodes: [{ id: nodeId }],
				duration: 350,
				padding: 0.22,
				includeHiddenNodes: false,
			});
		},
		[onFocusSession, fitView],
	);

	const initialNodes = useMemo(
		() => createSessionNodes(sessions, focusedSessionId, focusedSessionId, backendUrl, onFocusSession, handleOpenNode),
		[sessions, focusedSessionId, backendUrl, onFocusSession, handleOpenNode],
	);
	const positionedInitialNodes = useMemo(() => {
		const savedPositions = loadSavedPositions();
		return initialNodes.map((node) => ({
			...node,
			position: savedPositions[node.id] ?? node.position,
		}));
	}, [initialNodes]);
	const [nodes, setNodes, onNodesChange] = useNodesState<AgentCanvasNode>(positionedInitialNodes);
	const [edges, , onEdgesChange] = useEdgesState([]);

	useEffect(() => {
		setNodes((currentNodes) => {
			const currentById = new Map(currentNodes.map((node) => [node.id, node]));
			const savedPositions = loadSavedPositions();
			return initialNodes.map((node) => ({
				...node,
				position: currentById.get(node.id)?.position ?? savedPositions[node.id] ?? node.position,
			}));
		});
	}, [initialNodes, setNodes]);

	const handleNodesChange = useCallback(
		(changes: NodeChange<AgentCanvasNode>[]) => {
			onNodesChange(changes);
			if (!changes.some((change) => change.type === "position" && change.dragging === false)) return;
			setNodes((currentNodes) => {
				savePositions(currentNodes);
				return currentNodes;
			});
		},
		[onNodesChange, setNodes],
	);

	const handleNodeClick = useCallback<NodeMouseHandler<AgentCanvasNode>>(
		(_, node) => {
			onFocusSession(node.id);
		},
		[onFocusSession],
	);

	const handleNodeDoubleClick = useCallback<NodeMouseHandler<AgentCanvasNode>>(
		(_, node) => {
			handleOpenNode(node.id);
		},
		[handleOpenNode],
	);

	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			nodeTypes={nodeTypes}
			onNodesChange={handleNodesChange}
			onEdgesChange={onEdgesChange}
			onNodeClick={handleNodeClick}
			onNodeDoubleClick={handleNodeDoubleClick}
			fitView
			fitViewOptions={{ padding: 0.24 }}
			minZoom={0.35}
			maxZoom={1.5}
			className="agent-canvas"
		>
			<Background color="rgba(255,255,255,0.08)" gap={24} />
			<MiniMap pannable zoomable nodeStrokeWidth={2} className="!bg-bg-elevated !border !border-border-default" />
			<Controls className="!border !border-border-default !bg-bg-elevated !shadow-md" />
		</ReactFlow>
	);
}

export function AgentCanvas({
	sessions,
	backendUrl,
	focusedSessionId,
	onFocusSession,
	onCreateSession,
	canCreateSession,
	onRemoveSession,
}: AgentCanvasProps) {
	const [creating, setCreating] = useState(false);

	const handleCreateSession = () => {
		if (!canCreateSession) return;
		setCreating(true);
		try {
			onCreateSession();
		} finally {
			setCreating(false);
		}
	};

	return (
		<div className="relative h-full min-w-0 flex-1 bg-bg-base">
			{sessions.length === 0 ? (
				<div className="absolute inset-0 z-10 flex items-center justify-center">
					<button
						type="button"
						onClick={handleCreateSession}
						disabled={creating || !canCreateSession}
						title={canCreateSession ? "Add session" : "Select a project first"}
						className="group max-w-sm text-center disabled:cursor-not-allowed disabled:opacity-60"
					>
						<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-border-default bg-bg-elevated text-accent transition group-hover:border-accent/70 group-hover:bg-bg-hover">
							<Plus size={20} aria-hidden="true" />
						</div>
						<div className="mt-4 text-base font-semibold text-text-primary">
							{creating ? "Creating session..." : "No sessions yet"}
						</div>
						<div className="mt-2 text-sm leading-normal text-text-secondary">
							{canCreateSession ? "Create a session to place a new agent view on the canvas." : "Select a project before creating sessions."}
						</div>
					</button>
				</div>
			) : null}

			<ReactFlowProvider>
				<FlowCanvas
					sessions={sessions}
					backendUrl={backendUrl}
					focusedSessionId={focusedSessionId}
					onFocusSession={onFocusSession}
				/>
			</ReactFlowProvider>
		</div>
	);
}
