import type { ChatMessage } from "../types.ts";
import { BlockRenderer } from "./blocks/BlockRenderer.js";

interface MessageItemProps {
  message: ChatMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-accent-muted"
            : isAssistant
              ? "bg-bg-elevated"
              : "bg-bg-surface"
        }`}
      >
        {message.blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} />
        ))}
      </div>
    </div>
  );
}
