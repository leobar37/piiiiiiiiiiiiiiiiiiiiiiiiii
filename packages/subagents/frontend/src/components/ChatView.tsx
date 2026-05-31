import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { useSubAgentStore } from "../store/use-subagent-store.ts";
import { useSessionMessagesStore } from "../store/session-messages.ts";
import { useAutoScroll } from "../hooks/use-auto-scroll.ts";
import { MessageItem } from "./MessageItem.tsx";

interface ChatViewProps {
	instanceId: string;
}

export function ChatView({ instanceId }: ChatViewProps) {
	const isConnected = useSubAgentStore((s) => s.isConnected);
	const thread = useSubAgentStore((s) => s.agents.find((agent) => agent.instanceId === instanceId));
	const messagesByInstance = useSessionMessagesStore((s) => s.messagesByInstance);
	const streamingByInstance = useSessionMessagesStore((s) => s.streamingByInstance);
	const messages = useMemo(() => messagesByInstance.get(instanceId) ?? [], [messagesByInstance, instanceId]);
	const streaming = useMemo(() => streamingByInstance.get(instanceId) ?? false, [streamingByInstance, instanceId]);
	const dependencyKey = `${instanceId}:${messages.length}:${streaming ? "streaming" : "idle"}`;
	const modelLabel = thread?.modelProvider && thread.modelId ? `${thread.modelProvider}/${thread.modelId}` : "model pending";
	const { scrollRef, bottomRef, showJumpToLatest, scrollToBottom } = useAutoScroll<HTMLDivElement>({
		dependencyKey,
		threadId: instanceId,
	});

	return (
		<div className="flex h-full flex-col">
			<div className="flex min-h-11 items-center justify-between gap-3 border-b border-border-subtle bg-bg-elevated px-4 py-2">
				<div className="flex min-w-0 items-center gap-3">
					<span className="shrink-0 text-sm font-medium text-text-primary">
						{thread?.kind === "main" ? "Main Session" : "Live Session"}
					</span>
					<span
						className="min-w-0 truncate rounded border border-border-subtle bg-bg px-2 py-1 text-xs text-text-secondary"
						title={modelLabel}
					>
						{modelLabel}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<span className={`h-2 w-2 rounded-full ${isConnected ? "bg-success" : "bg-error"}`} />
					<span className="text-xs text-text-muted">{isConnected ? "Connected" : "Disconnected"}</span>
				</div>
			</div>
			<div className="relative min-h-0 flex-1">
				<div ref={scrollRef} className="h-full space-y-4 overflow-y-auto p-4">
					{messages.length === 0 ? (
						<div className="flex h-full items-center justify-center">
							<EmptyMessageState thread={thread} />
						</div>
					) : (
						<AnimatePresence initial={false}>
							{messages.map((msg) => (
								<motion.div
									key={msg.id}
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -6 }}
									transition={{ duration: 0.18, ease: "easeOut" }}
								>
									<MessageItem message={msg} />
								</motion.div>
							))}
						</AnimatePresence>
					)}
					{streaming && (
						<motion.div
							className="flex justify-start"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.16 }}
						>
							<div className="rounded-lg bg-bg-elevated px-4 py-2">
								<span className="animate-pulse text-sm text-text-muted">...</span>
							</div>
						</motion.div>
					)}
					<div ref={bottomRef} />
				</div>
				{showJumpToLatest && (
					<button
						type="button"
						onClick={scrollToBottom}
						className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-border-default bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary shadow-md hover:text-text-primary"
					>
						Jump to latest
					</button>
				)}
			</div>
		</div>
	);
}

function EmptyMessageState({ thread }: { thread?: ReturnType<typeof useSubAgentStore.getState>["agents"][number] }) {
	if (thread?.kind === "subagent" && (thread.state === "failed" || thread.state === "completed" || thread.state === "timed_out")) {
		return (
			<div className="max-w-sm rounded border border-border-subtle bg-bg-elevated px-4 py-3 text-center">
				<div className="text-sm font-medium text-text-secondary">No session messages recorded.</div>
				<div className="mt-1 text-xs leading-relaxed text-text-tertiary">
					This subagent has run metadata, but no chat transcript was available. Check the run input, output, and error details.
				</div>
			</div>
		);
	}
	return <span className="text-sm text-text-muted">Waiting for messages...</span>;
}
