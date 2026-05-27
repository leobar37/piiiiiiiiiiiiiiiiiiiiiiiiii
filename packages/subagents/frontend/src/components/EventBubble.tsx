import type { SubAgentEvent } from "../types.ts";

interface EventBubbleProps {
  event: SubAgentEvent;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getEventContent(event: SubAgentEvent): { icon: string; title: string; body?: string; variant: "system" | "agent" | "tool" | "error" | "progress" } {
  switch (event.type) {
    case "task.start":
      return { icon: ">", title: "Agent started", body: (event as unknown as { description?: string }).description, variant: "system" };
    case "task.end": {
      const result = (event as unknown as { result?: { status: string; summary: string } }).result;
      return { icon: result?.status === "completed" ? "ok" : "x", title: `Task ${result?.status ?? "ended"}`, body: result?.summary, variant: result?.status === "completed" ? "agent" : "error" };
    }
    case "turn.complete": {
      const turn = event as unknown as { turnIndex: number; toolCount: number; hadError: boolean };
      return { icon: "r", title: `Turn ${turn.turnIndex + 1} complete`, body: `${turn.toolCount} tool${turn.toolCount === 1 ? "" : "s"}${turn.hadError ? " (had error)" : ""}`, variant: "system" };
    }
    case "tool.start": {
      const tool = event as unknown as { toolName: string };
      return { icon: "T", title: `Running tool`, body: tool.toolName, variant: "tool" };
    }
    case "tool.end": {
      const tool = event as unknown as { toolName: string; isError: boolean };
      return { icon: tool.isError ? "x" : "ok", title: `Tool ${tool.isError ? "failed" : "done"}`, body: tool.toolName, variant: tool.isError ? "error" : "tool" };
    }
    case "tool.execute": {
      const tool = event as unknown as { toolName: string; isError: boolean };
      return { icon: tool.isError ? "x" : "*", title: `Tool executed`, body: tool.toolName, variant: tool.isError ? "error" : "tool" };
    }
    case "progress.update": {
      const msg = (event as unknown as { message?: string }).message;
      return { icon: "c", title: "Progress", body: msg, variant: "progress" };
    }
    case "lifecycle.change": {
      const lc = event as unknown as { previous: string; current: string };
      return { icon: "s", title: "State change", body: `${lc.previous} -> ${lc.current}`, variant: "system" };
    }
    case "error": {
      const err = (event as unknown as { error?: string; fatal?: boolean }).error;
      return { icon: "!", title: (event as unknown as { fatal?: boolean }).fatal ? "Fatal error" : "Error", body: err, variant: "error" };
    }
    case "query.response": {
      const qr = event as unknown as { question: string; answer: string };
      return { icon: "?", title: `Query: ${qr.question}`, body: qr.answer, variant: "agent" };
    }
    case "summary.available": {
      const sa = event as unknown as { summary: string; messageCount: number };
      return { icon: "n", title: `Summary (${sa.messageCount} messages)`, body: sa.summary, variant: "agent" };
    }
    case "instance.created":
      return { icon: "+", title: "Instance created", variant: "system" };
    case "instance.state":
      return { icon: "i", title: "State update", variant: "system" };
    default:
      return { icon: "•", title: event.type, body: undefined, variant: "system" };
  }
}

const VARIANT_STYLES = {
  system: "border-l-2 border-border-default bg-bg-elevated",
  agent: "border-l-2 border-success bg-bg-elevated",
  tool: "border-l-2 border-warning bg-bg-elevated",
  error: "border-l-2 border-error bg-bg-elevated",
  progress: "border-l-2 border-accent bg-bg-elevated",
};

export function EventBubble({ event }: EventBubbleProps) {
  const content = getEventContent(event);
  return (
    <div className={`px-3 py-2 rounded-md ${VARIANT_STYLES[content.variant]}`}>
      <div className="flex items-start gap-2">
        <span className="text-sm mt-0.5 select-none">{content.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{content.title}</span>
            <span className="text-xs text-text-muted ml-auto shrink-0">{formatTime(event.timestamp)}</span>
          </div>
          {content.body ? (
            <p className="text-sm text-text-secondary mt-0.5 break-words">{content.body}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
