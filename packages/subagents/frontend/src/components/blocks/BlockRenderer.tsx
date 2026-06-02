import type { MessageBlock } from "../../types.ts";
import { TextBlock } from "./TextBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { ToolResultBlock } from "./ToolResultBlock";
import { ImageBlock } from "./ImageBlock";

interface BlockRendererProps {
	block: MessageBlock;
	currentThreadId: string;
}

export function BlockRenderer({ block, currentThreadId }: BlockRendererProps) {
	switch (block.type) {
		case "text":
			return <TextBlock text={block.text} />;
		case "thinking":
			return <ThinkingBlock thinking={block.thinking} signature={block.signature} redacted={block.redacted} />;
		case "toolCall":
			return <ToolCallBlock id={block.id} name={block.name} args={block.arguments} currentThreadId={currentThreadId} />;
		case "toolResult":
			return (
				<ToolResultBlock
					toolCallId={block.toolCallId}
					toolName={block.toolName}
					content={block.content}
					isError={block.isError}
				/>
			);
		case "image":
			return <ImageBlock data={block.data} mimeType={block.mimeType} />;
		default:
			return null;
	}
}
