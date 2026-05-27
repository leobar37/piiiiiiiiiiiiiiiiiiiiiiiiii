import { useEffect } from "react";
import { useSubAgentStore } from "../store/use-subagent-store.ts";
import { fetchAgents } from "../api.ts";
import { AgentCard } from "./AgentCard.tsx";

export function AgentList() {
  const agents = useSubAgentStore((s) => s.agents);
  const selectedAgentId = useSubAgentStore((s) => s.selectedAgentId);
  const setAgents = useSubAgentStore((s) => s.setAgents);
  const selectAgent = useSubAgentStore((s) => s.selectAgent);

  useEffect(() => {
    fetchAgents()
      .then((data) => setAgents(data))
      .catch((err) => console.error("[AgentList] failed to load agents:", err));
  }, [setAgents]);

  const sorted = [...agents].sort((a, b) => {
    const score = (s: (typeof agents)[0]) =>
      s.state === "running" ? 0 : s.state === "starting" ? 1 : s.state === "completing" ? 2 : 3;
    return score(a) - score(b) || b.lastActivityAt - a.lastActivityAt;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border-subtle bg-bg-elevated">
        <h1 className="text-base font-semibold text-text-primary">
          SubAgents
        </h1>
        <p className="text-xs text-text-muted mt-0.5">
          {agents.length} instance{agents.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sorted.map((agent) => (
          <AgentCard
            key={agent.instanceId}
            agent={agent}
            isSelected={agent.instanceId === selectedAgentId}
            onClick={() =>
              selectAgent(
                agent.instanceId === selectedAgentId
                  ? null
                  : agent.instanceId,
              )
            }
          />
        ))}
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-sm text-text-muted">No active agents</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
