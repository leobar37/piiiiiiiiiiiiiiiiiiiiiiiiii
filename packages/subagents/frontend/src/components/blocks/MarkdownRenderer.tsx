import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock.js";
import { HttpBlock } from "./HttpBlock.js";

interface MarkdownRendererProps {
	content: string;
}

function isHttpBlock(code: string): boolean {
	const trimmed = code.trim();
	return (
		trimmed.startsWith("GET ") ||
		trimmed.startsWith("POST ") ||
		trimmed.startsWith("PUT ") ||
		trimmed.startsWith("PATCH ") ||
		trimmed.startsWith("DELETE ") ||
		trimmed.startsWith("HEAD ") ||
		trimmed.startsWith("OPTIONS ") ||
		trimmed.startsWith("HTTP/")
	);
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				p: ({ children }) => (
					<p className="text-sm text-text-primary leading-relaxed mb-3 last:mb-0">
						{children}
					</p>
				),
				strong: ({ children }) => (
					<strong className="font-semibold text-text-primary">{children}</strong>
				),
				em: ({ children }) => (
					<em className="italic text-text-secondary">{children}</em>
				),
				code: ({ children, className }) => {
					const isInline = !className;
					if (isInline) {
						return (
							<code className="bg-bg-surface border border-border-subtle rounded px-1 py-0.5 text-xs font-mono text-text-primary">
								{children}
							</code>
						);
					}
					const codeText = String(children || "");
					const lang = className?.replace("language-", "") || "";
					if (isHttpBlock(codeText)) {
						return <HttpBlock content={codeText} />;
					}
					return <CodeBlock code={codeText} language={lang} />;
				},
				pre: ({ children }) => {
					return <>{children}</>;
				},
				ul: ({ children }) => (
					<ul className="list-disc list-inside text-sm text-text-primary space-y-1 mb-3">
						{children}
					</ul>
				),
				ol: ({ children }) => (
					<ol className="list-decimal list-inside text-sm text-text-primary space-y-1 mb-3">
						{children}
					</ol>
				),
				li: ({ children }) => (
					<li className="text-sm text-text-primary">{children}</li>
				),
				a: ({ children, href }) => (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						className="text-accent hover:underline"
					>
						{children}
					</a>
				),
				blockquote: ({ children }) => (
					<blockquote className="border-l-2 border-border-default pl-3 text-text-secondary italic my-3">
						{children}
					</blockquote>
				),
				hr: () => <hr className="border-border-subtle my-4" />,
				h1: ({ children }) => (
					<h1 className="text-lg font-semibold text-text-primary mb-2">{children}</h1>
				),
				h2: ({ children }) => (
					<h2 className="text-base font-semibold text-text-primary mb-2">{children}</h2>
				),
				h3: ({ children }) => (
					<h3 className="text-sm font-semibold text-text-primary mb-1">{children}</h3>
				),
			}}
		>
			{content}
		</ReactMarkdown>
	);
}
