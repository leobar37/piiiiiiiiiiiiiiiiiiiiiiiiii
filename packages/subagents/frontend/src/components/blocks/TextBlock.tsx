import { MarkdownRenderer } from "./MarkdownRenderer";

interface TextBlockProps {
	text: string;
}

export function TextBlock({ text }: TextBlockProps) {
	if (!text.trim()) return null;
	return (
		<div className="min-w-0 overflow-x-hidden text-sm text-text-primary leading-relaxed py-0.5">
			<MarkdownRenderer content={text} />
		</div>
	);
}
