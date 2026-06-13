import { memo, useCallback } from "react";
import { Handle, NodeResizeControl, Position, type NodeProps, type ResizeParams } from "@xyflow/react";
import { ExternalLink } from "lucide-react";
import type { AgentCanvasNode } from "./types.js";

const NODE_SIZES_KEY = "pi-dashboard:agent-canvas:sizes";
const MIN_NODE_SIZE = { width: 520, height: 360 };

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

function saveNodeSize(nodeId: string, size: { width: number; height: number }): void {
	const sizes = loadSavedSizes();
	sizes[nodeId] = size;
	window.localStorage.setItem(NODE_SIZES_KEY, JSON.stringify(sizes));
}

export const AgentSessionNode = memo(function AgentSessionNode({ data }: NodeProps<AgentCanvasNode>) {
	const { session, backendUrl, focused, onFocus, onOpen } = data;
	const title = session.name || `Session ${session.id.slice(0, 8)}`;
	const threadId = session.threadId ?? session.id;
	const iframeUrl = `${backendUrl}/thread/${encodeURIComponent(threadId)}`;

	const handleResizeStart = useCallback(() => {
		document.body.classList.add("agent-node-resizing");
	}, []);

	const handleResizeEnd = useCallback(
		(_: unknown, params: ResizeParams) => {
			document.body.classList.remove("agent-node-resizing");
			saveNodeSize(session.id, {
				width: params.width,
				height: params.height,
			});
		},
		[session.id],
	);

	return (
		<div
			className={`relative overflow-visible rounded-lg border bg-bg-base shadow-md transition ${
				focused ? "border-accent/80 ring-2 ring-accent/25" : "border-border-default hover:border-border-hover"
			}`}
			style={{ width: "100%", height: "100%" }}
			onDoubleClick={() => onOpen(session.id)}
		>
			<NodeResizeControl
				position="bottom-right"
				minWidth={MIN_NODE_SIZE.width}
				minHeight={MIN_NODE_SIZE.height}
				className="agent-node-resize-grip"
				onResizeStart={handleResizeStart}
				onResizeEnd={handleResizeEnd}
			>
				<div className="agent-node-resize-grip-inner" aria-hidden="true" />
			</NodeResizeControl>
			<Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-border-default !bg-bg-hover" />
			<div className="agent-node-drag-handle flex cursor-grab items-center justify-between gap-3 border-b border-border-subtle bg-bg-elevated/70 px-3 py-2 active:cursor-grabbing">
				<button type="button" onClick={() => onFocus(session.id)} className="min-w-0 flex-1 text-left">
					<div className="truncate text-sm font-medium text-text-primary">{title}</div>
				</button>
				<a
					href={iframeUrl}
					target="_blank"
					rel="noreferrer"
					title="Open in standalone tab"
					className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition hover:bg-bg-hover hover:text-text-primary"
				>
					<ExternalLink size={13} aria-hidden="true" />
				</a>
			</div>

			<div className="h-[calc(100%-42px)] bg-bg-base">
				<iframe
					src={iframeUrl}
					title={`Agent session ${session.id}`}
					className="h-full w-full border-0"
					allow="clipboard-read; clipboard-write"
				/>
			</div>
			<Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-border-default !bg-bg-hover" />
		</div>
	);
});
