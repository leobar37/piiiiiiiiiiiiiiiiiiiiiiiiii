import type { SubAgentInstanceState } from "../types.ts";
import { StatusBadge } from "./StatusBadge.tsx";

interface AgentCardProps {
  agent: SubAgentInstanceState;
  isSelected?: boolean;
  onClick?: () => void;
}

function elapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${Math.floor(s % 60).toString().padStart(2, "0")}s`;
}

export function AgentCard({ agent, isSelected, onClick }: AgentCardProps) {
  const isRunning = agent.state === "running";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-colors ${
        isSelected
          ? "border-accent bg-accent-muted"
          : "border-border-subtle bg-bg-elevated hover:bg-bg-hover"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusBadge state={agent.state} pulse={isRunning} />
          <span className="text-sm font-medium text-text-primary truncate">
            {agent.definitionName}
          </span>
        </div>
        <span className="text-xs text-text-muted shrink-0">
          {agent.taskId}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-text-muted">
        {agent.turnCount > 0 ? (
          <span>
            {agent.turnCount} turn{agent.turnCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {agent.toolCount > 0 ? (
          <span>
            {agent.toolCount} tool{agent.toolCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {agent.startTime ? (
          <span>{elapsed(agent.durationMs)}</span>
        ) : null}
      </div>

      {agent.currentTool ? (
        <div className="mt-1.5 text-xs text-accent truncate">
          Running: {agent.currentTool}
        </div>
      ) : null}

      {agent.error ? (
        <div className="mt-1.5 text-xs text-error truncate">
          {agent.error}
        </div>
      ) : null}
    </button>
  );
}
