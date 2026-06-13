import { Streamdown } from "streamdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { HttpBlock } from "./HttpBlock";

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
		<Streamdown
			mode="streaming"
			parseIncompleteMarkdown
			remarkPlugins={[remarkGfm]}
			controls={{
				table: {
					copy: true,
					download: false,
					fullscreen: false,
				},
				code: {
					copy: true,
					download: false,
				},
				mermaid: {
					copy: true,
					download: false,
					fullscreen: false,
					panZoom: false,
				},
			}}
			components={{
				p: ({ children }) => (
					<p className="mb-2 break-words text-sm leading-6 text-text-primary last:mb-0">
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
							<code className="break-all rounded border border-border-subtle bg-bg-surface px-1 py-0.5 font-mono text-xs text-text-primary">
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
					<ul className="mb-2 list-inside list-disc space-y-0.5 text-sm text-text-primary">
						{children}
					</ul>
				),
				ol: ({ children }) => (
					<ol className="mb-2 list-inside list-decimal space-y-0.5 text-sm text-text-primary">
						{children}
					</ol>
				),
				li: ({ children }) => (
					<li className="break-words text-sm text-text-primary">{children}</li>
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
					<blockquote className="my-2 border-l-2 border-border-default pl-3 text-text-secondary italic">
						{children}
					</blockquote>
				),
				table: ({ children }) => (
					<div className="my-3 min-w-0 overflow-x-hidden rounded-md border border-border-subtle bg-bg-base/50">
						<table className="w-full table-fixed border-collapse text-left text-xs text-text-secondary">
							{children}
						</table>
					</div>
				),
				thead: ({ children }) => (
					<thead className="bg-bg-surface/70 text-text-primary">
						{children}
					</thead>
				),
				tbody: ({ children }) => (
					<tbody className="divide-y divide-border-subtle">
						{children}
					</tbody>
				),
				tr: ({ children }) => (
					<tr className="align-top">
						{children}
					</tr>
				),
				th: ({ children }) => (
					<th className="break-words border-b border-border-default px-3 py-2 text-xs font-semibold text-text-primary">
						{children}
					</th>
				),
				td: ({ children }) => (
					<td className="max-w-[28rem] break-words px-3 py-2 leading-5 text-text-secondary">
						<div className="min-w-0 whitespace-normal break-words">
							{children}
						</div>
					</td>
				),
				hr: () => <hr className="my-3 border-border-subtle" />,
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
		</Streamdown>
	);
}
