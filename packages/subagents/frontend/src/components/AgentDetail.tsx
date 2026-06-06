import { useEffect } from "react";
import type { SubAgentInstanceState } from "../types.ts";
import { useAgent } from "../hooks/use-agent.ts";
import { useAgentMessages } from "../hooks/use-agent-messages.ts";
import { useAgentRun } from "../hooks/use-agent-run.ts";
import { useLionState } from "../hooks/use-lion-state.ts";
import { ChatView } from "./ChatView.tsx";
import { StatusBadge } from "./StatusBadge.tsx";
import { useSubAgentStore } from "../store/use-subagent-store.ts";
import { useSessionMessagesStore } from "../store/session-messages.ts";
import { navigateToThread } from "../navigation.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { AgentRunSidebar } from "./AgentRunSidebar.tsx";
import { LionModeBadge } from "./LionModeBadge.tsx";
import { ChatComposer } from "./ChatComposer.tsx";

interface AgentDetailProps {
  instanceId: string;
  onBack: () => void;
}

export function AgentDetail({ instanceId, onBack }: AgentDetailProps) {
  const { data: fetchedAgent } = useAgent(instanceId);
  const { data: fetchedMessages } = useAgentMessages(instanceId);
  const { data: fetchedRun, isLoading: isRunLoading } = useAgentRun(instanceId);
  const { data: lionState } = useLionState();

  const setMessages = useSessionMessagesStore((s) => s.setMessages);
  const agents = useSubAgentStore((s) => s.agents);

  const storeAgent = agents.find((a) => a.instanceId === instanceId);

  // Sync TanStack Query data into zustand stores on mount / change
  useEffect(() => {
    if (fetchedMessages) {
      setMessages(instanceId, fetchedMessages);
    }
  }, [fetchedMessages, instanceId, setMessages]);

  const displayAgent: SubAgentInstanceState | undefined =
    storeAgent ?? fetchedAgent ?? undefined;
  const parentThread = displayAgent?.parentThreadId
    ? agents.find((agent) => agent.instanceId === displayAgent.parentThreadId)
    : null;
  const modelLabel =
    displayAgent?.modelProvider && displayAgent.modelId
      ? `${displayAgent.modelProvider}/${displayAgent.modelId}`
      : null;

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-bg-elevated">
        {displayAgent?.parentThreadId ? (
          <button
            onClick={() => navigateToThread(displayAgent.parentThreadId ?? null)}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            ← {parentThread?.kind === "main" ? "Main session" : parentThread?.description || "Parent thread"}
          </button>
        ) : (
          <button
            onClick={onBack}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Lion
          </button>
        )}
        {displayAgent ? (
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge state={displayAgent.state} pulse={displayAgent.state === "running"} />
            <span className="text-sm font-medium text-text-primary truncate">
              {displayAgent.kind === "main" ? "Main agent" : displayAgent.description || displayAgent.definitionName}
            </span>
            <span className="text-xs text-text-muted shrink-0">
              {displayAgent.kind === "main" ? displayAgent.sessionId ?? "main" : displayAgent.taskId}
            </span>
            {modelLabel ? (
              <span className="min-w-0 truncate rounded border border-border-subtle bg-bg px-2 py-1 text-xs text-text-secondary">
                {modelLabel}
              </span>
            ) : null}
            <LionModeBadge state={lionState} />
          </div>
        ) : (
          <span className="text-sm text-text-muted">Loading...</span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
          <ErrorBoundary threadId={instanceId}>
            <div className="flex h-full min-w-0 flex-col">
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChatView instanceId={instanceId} />
              </div>
              <ChatComposer instanceId={instanceId} thread={displayAgent} />
            </div>
          </ErrorBoundary>
        </div>
        <AgentRunSidebar agent={displayAgent} run={fetchedRun} isLoading={isRunLoading} />
      </div>
    </div>
  );
}
