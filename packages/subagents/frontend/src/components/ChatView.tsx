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
	const thread = useSubAgentStore((s) => s.agents.find((agent) => agent.instanceId === instanceId));
	const messagesByInstance = useSessionMessagesStore((s) => s.messagesByInstance);
	const streamingByInstance = useSessionMessagesStore((s) => s.streamingByInstance);
	const messages = useMemo(() => messagesByInstance.get(instanceId) ?? [], [messagesByInstance, instanceId]);
	const streaming = useMemo(() => streamingByInstance.get(instanceId) ?? false, [streamingByInstance, instanceId]);
	const dependencyKey = `${instanceId}:${messages.length}:${streaming ? "streaming" : "idle"}`;
	const { scrollRef, bottomRef, showJumpToLatest, scrollToBottom } = useAutoScroll<HTMLDivElement>({
		dependencyKey,
		threadId: instanceId,
	});

	return (
		<div className="flex h-full min-w-0 flex-col overflow-x-hidden">
			<div className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden">
				<div ref={scrollRef} className="h-full min-w-0 space-y-2 overflow-y-auto overflow-x-hidden p-3">
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

	return (
		<div className="flex flex-col items-center gap-3 text-center">
			<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-muted">
				<svg className="h-6 w-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12a9 9 0 0118 0z" />
				</svg>
			</div>
			<div className="text-sm font-medium text-text-secondary">No messages yet</div>
			<div className="max-w-[16rem] text-xs text-text-tertiary">
				{thread?.kind === "main"
					? "Send a message to start the conversation."
					: "This thread has no messages yet."}
			</div>
		</div>
	);
}
