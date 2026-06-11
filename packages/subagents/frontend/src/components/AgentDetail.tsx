import { useEffect, useState } from "react";
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
import { isLionUiActive, LionModeBadge } from "./LionModeBadge.tsx";
import { ChatComposer } from "./ChatComposer.tsx";
import { PanelRight, PanelRightClose } from "lucide-react";

interface AgentDetailProps {
  instanceId: string;
  onBack: () => void;
}

export function AgentDetail({ instanceId, onBack }: AgentDetailProps) {
  const { data: fetchedAgent } = useAgent(instanceId);
  const { data: fetchedMessages } = useAgentMessages(instanceId);
  const { data: fetchedRun, isLoading: isRunLoading } = useAgentRun(instanceId);
  const { data: lionState } = useLionState();
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
  const isMainThread = displayAgent?.kind === "main";
  const isLionActive = isLionUiActive(lionState);
  const showMainNavigation = !isMainThread || isLionActive;
  const showStateBadge = !isMainThread;

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);

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
        ) : showMainNavigation ? (
          <button
            onClick={onBack}
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Lion
          </button>
        ) : null}
        {displayAgent ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {showStateBadge ? <StatusBadge state={displayAgent.state} pulse={displayAgent.state === "running"} /> : null}
            <span className="text-sm font-medium text-text-primary truncate">
              {displayAgent.kind === "main" ? "Main agent" : displayAgent.description || displayAgent.definitionName}
            </span>
            <LionModeBadge state={lionState} />
          </div>
        ) : (
          <span className="text-sm text-text-muted">Loading...</span>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden lg:flex ml-auto h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {sidebarOpen ? (
            <PanelRightClose className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PanelRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
          <ErrorBoundary threadId={instanceId}>
            <div className="flex h-full min-w-0 flex-col">
              {displayAgent && (
                <div className={sidebarOpen ? "hidden lg:hidden" : ""}>
                  <SessionSummaryBar agent={displayAgent} run={fetchedRun} />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                <ChatView instanceId={instanceId} />
              </div>
              <ChatComposer instanceId={instanceId} thread={displayAgent} />
            </div>
          </ErrorBoundary>
        </div>
        <AgentRunSidebar agent={displayAgent} run={fetchedRun} isLoading={isRunLoading} isOpen={sidebarOpen} />
      </div>
    </div>
  );
}

function SessionSummaryBar({ agent, run }: { agent?: SubAgentInstanceState; run?: { turnCount?: number; toolCount?: number; durationMs?: number } }) {
  return (
    <div className="flex items-center gap-4 border-b border-border-subtle bg-bg-elevated px-4 py-1.5 text-xs text-text-tertiary">
      <span>Turns <span className="text-text-secondary">{run?.turnCount ?? agent?.turnCount ?? 0}</span></span>
      <span>Tools <span className="text-text-secondary">{run?.toolCount ?? agent?.toolCount ?? 0}</span></span>
      <span className="ml-auto">{formatDurationCompact(run?.durationMs ?? agent?.durationMs ?? 0)}</span>
    </div>
  );
}

function formatDurationCompact(value: number): string {
  if (value <= 0) return "0s";
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
