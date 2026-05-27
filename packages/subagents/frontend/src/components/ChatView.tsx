import { useEffect, useRef, useMemo } from "react";
import { useSubAgentStore } from "../store/use-subagent-store.ts";
import { useSessionMessagesStore } from "../store/session-messages.ts";
import { MessageItem } from "./MessageItem.tsx";
import { useSseEvents } from "../hooks/use-sse.ts";

interface ChatViewProps {
  instanceId: string;
}

export function ChatView({ instanceId }: ChatViewProps) {
  const isConnected = useSubAgentStore((s) => s.isConnected);
  const messagesByInstance = useSessionMessagesStore((s) => s.messagesByInstance);
  const streamingByInstance = useSessionMessagesStore((s) => s.streamingByInstance);
  const messages = useMemo(() => messagesByInstance.get(instanceId) ?? [], [messagesByInstance, instanceId]);
  const streaming = useMemo(() => streamingByInstance.get(instanceId) ?? false, [streamingByInstance, instanceId]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useSseEvents(instanceId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-bg-elevated">
        <span className="text-sm font-medium text-text-primary">
          Live Session
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-success" : "bg-error"}`}
          />
          <span className="text-xs text-text-muted">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-text-muted">
              Waiting for messages...
            </span>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))
        )}
        {streaming && (
          <div className="flex justify-start">
            <div className="bg-bg-elevated rounded-lg px-4 py-2">
              <span className="text-sm text-text-muted animate-pulse">...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
