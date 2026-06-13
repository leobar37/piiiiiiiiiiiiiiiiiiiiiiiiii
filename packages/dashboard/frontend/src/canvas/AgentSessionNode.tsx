import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ExternalLink } from "lucide-react";
import type { AgentCanvasNode } from "./types.js";

export const AgentSessionNode = memo(function AgentSessionNode({ data }: NodeProps<AgentCanvasNode>) {
	const { session, backendUrl, focused, onFocus, onOpen } = data;
	const title = session.name || `Session ${session.id.slice(0, 8)}`;
	const threadId = session.threadId ?? session.id;
	const iframeUrl = `${backendUrl}/thread/${encodeURIComponent(threadId)}`;

	return (
		<div
			className={`w-[760px] overflow-hidden rounded-lg border bg-bg-base shadow-md transition ${
				focused ? "border-accent/80 ring-2 ring-accent/25" : "border-border-default hover:border-border-hover"
			}`}
			onDoubleClick={() => onOpen(session.id)}
		>
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

			<div className="h-[500px] bg-bg-base">
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
