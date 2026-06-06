import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SendHorizontal, Terminal } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useThreadCommands } from "../hooks/use-thread-commands.ts";
import { type ComposerMode, useSendThreadMessage } from "../hooks/use-send-thread-message.ts";
import { useSubAgentStore } from "../store/use-subagent-store.ts";
import type { SubAgentInstanceState } from "../types.ts";

interface ChatComposerProps {
	instanceId: string;
	thread?: SubAgentInstanceState;
}

interface DashboardCommand {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
}

const MODE_LABELS: Record<ComposerMode, string> = {
	prompt: "Prompt",
	follow_up: "Follow-up",
	steer: "Steer",
};

const MODES = Object.keys(MODE_LABELS) as ComposerMode[];

export function ChatComposer({ instanceId, thread }: ChatComposerProps) {
	const [message, setMessage] = useState("");
	const [mode, setMode] = useState<ComposerMode>("prompt");
	const [commandsOpen, setCommandsOpen] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const shouldReduceMotion = useReducedMotion();
	const isConnected = useSubAgentStore((state) => state.isConnected);
	const sendMessage = useSendThreadMessage();
	const { data: commands = [] } = useThreadCommands(instanceId);
	const query = extractCommandQuery(message);
	const commandIntent = message.trimStart().startsWith("/");
	const filteredCommands = useMemo(() => {
		const normalized = query.toLowerCase();
		if (!normalized) return commands.slice(0, 10);
		return commands
			.filter((command) => {
				const haystack = `${command.name} ${command.description ?? ""}`.toLowerCase();
				return haystack.includes(normalized);
			})
			.slice(0, 10);
	}, [commands, query]);

	const trimmed = message.trim();
	const canSend = Boolean(thread && isConnected && trimmed && !sendMessage.isPending);
	const statusText = !thread
		? "Thread unavailable"
		: !isConnected
			? "Disconnected"
			: sendMessage.isPending
					? "Sending"
					: null;

	function resizeTextarea(target: HTMLTextAreaElement) {
		target.style.height = "0px";
		target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
	}

	function handleTextChange(value: string) {
		setMessage(value);
		setCommandsOpen(value.trimStart().startsWith("/"));
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (event.key === "/" && message.trim().length === 0) {
			setCommandsOpen(true);
			return;
		}
		if (event.key === "Escape") {
			setCommandsOpen(false);
			return;
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			void submit();
		}
	}

	async function submit() {
		if (!canSend) return;
		const outbound = trimmed;
		setMessage("");
		setCommandsOpen(false);
		if (textareaRef.current) textareaRef.current.style.height = "44px";
		try {
			await sendMessage.mutateAsync({ threadId: instanceId, message: outbound, mode });
		} catch {
			setMessage(outbound);
		}
	}

	function insertCommand(name: string) {
		const next = `/${name} `;
		setMessage(next);
		setCommandsOpen(false);
		requestAnimationFrame(() => {
			textareaRef.current?.focus();
			textareaRef.current?.setSelectionRange(next.length, next.length);
		});
	}

	return (
		<div className="border-t border-border-subtle bg-bg-base px-4 py-3">
			<motion.div
				className={`relative mx-auto flex max-w-5xl flex-col rounded-xl border bg-bg-surface shadow-md transition-colors ${
					isFocused ? "border-border-hover" : "border-border-default"
				}`}
				animate={shouldReduceMotion ? undefined : { y: isFocused ? -1 : 0, scale: isFocused ? 1.002 : 1 }}
				transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
			>
				<AnimatePresence>
					{commandsOpen && commandIntent && filteredCommands.length > 0 ? (
						<CommandPalette commands={filteredCommands} onSelect={insertCommand} shouldReduceMotion={shouldReduceMotion} />
					) : null}
				</AnimatePresence>

				<textarea
					ref={textareaRef}
					value={message}
					rows={1}
					placeholder="Message thread"
					onChange={(event) => {
						handleTextChange(event.target.value);
						resizeTextarea(event.target);
					}}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					onKeyDown={handleKeyDown}
					className="min-h-11 resize-none bg-transparent px-4 py-3 text-sm leading-normal text-text-primary outline-none placeholder:text-text-tertiary"
				/>

				<div className="flex items-center justify-between gap-3 px-3 pb-3">
					<div className="flex min-w-0 items-center gap-2">
						<ModeTabs mode={mode} onChange={setMode} shouldReduceMotion={shouldReduceMotion} />
					</div>

					<div className="flex shrink-0 items-center gap-2">
						<AnimatePresence mode="wait">
							{statusText ? (
								<motion.span
									key={statusText}
									className="text-xs text-text-muted"
									initial={shouldReduceMotion ? false : { opacity: 0, y: 3 }}
									animate={{ opacity: 1, y: 0 }}
									exit={shouldReduceMotion ? undefined : { opacity: 0, y: -3 }}
									transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
								>
									{statusText}
								</motion.span>
							) : null}
						</AnimatePresence>
						<AnimatePresence>
							{sendMessage.error ? (
								<motion.span
									className="max-w-64 truncate text-xs text-error"
									title={sendMessage.error.message}
									initial={shouldReduceMotion ? false : { opacity: 0, x: 6 }}
									animate={{ opacity: 1, x: 0 }}
									exit={shouldReduceMotion ? undefined : { opacity: 0, x: 6 }}
									transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
								>
									{sendMessage.error.message}
								</motion.span>
							) : null}
						</AnimatePresence>
						<motion.button
							type="button"
							onClick={() => void submit()}
							disabled={!canSend}
							whileTap={shouldReduceMotion || !canSend ? undefined : { scale: 0.94 }}
							whileHover={shouldReduceMotion || !canSend ? undefined : { scale: 1.04 }}
							className="flex h-9 w-9 items-center justify-center rounded-full bg-text-primary text-bg-base transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-text-muted disabled:text-bg-surface"
							title="Send"
							aria-label="Send"
						>
							<SendHorizontal className="h-4 w-4" aria-hidden="true" />
						</motion.button>
					</div>
				</div>
			</motion.div>
		</div>
	);
}

interface ModeTabsProps {
	mode: ComposerMode;
	onChange(mode: ComposerMode): void;
	shouldReduceMotion: boolean | null;
}

function ModeTabs({ mode, onChange, shouldReduceMotion }: ModeTabsProps) {
	return (
		<div className="flex shrink-0 rounded-md border border-border-subtle bg-bg p-0.5">
			{MODES.map((item) => (
				<motion.button
					key={item}
					type="button"
					onClick={() => onChange(item)}
					whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
					className={`relative rounded px-2.5 py-1.5 text-xs transition-colors ${
						mode === item ? "text-accent-hover" : "text-text-secondary hover:text-text-primary"
					}`}
				>
					{mode === item ? (
						<motion.span
							layoutId="composer-mode-indicator"
							className="absolute inset-0 rounded bg-accent-muted"
							transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
						/>
					) : null}
					<span className="relative">{MODE_LABELS[item]}</span>
				</motion.button>
			))}
		</div>
	);
}

interface CommandPaletteProps {
	commands: DashboardCommand[];
	onSelect(name: string): void;
	shouldReduceMotion: boolean | null;
}

function CommandPalette({ commands, onSelect, shouldReduceMotion }: CommandPaletteProps) {
	return (
		<motion.div
			className="absolute bottom-full left-3 mb-2 max-h-72 w-[min(34rem,calc(100vw-3rem))] overflow-y-auto rounded-lg border border-border-default bg-bg-elevated p-1 shadow-md"
			initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={shouldReduceMotion ? undefined : { opacity: 0, y: 4, scale: 0.99 }}
			transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
		>
			{commands.map((command, index) => (
				<motion.button
					key={`${command.source}:${command.name}`}
					type="button"
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onSelect(command.name)}
					className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-bg-hover"
					initial={shouldReduceMotion ? false : { opacity: 0, x: -4 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ duration: 0.14, delay: shouldReduceMotion ? 0 : Math.min(index * 0.015, 0.08) }}
				>
					<Terminal className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
					<span className="min-w-0 flex-1">
						<span className="block truncate text-sm font-medium text-text-primary">/{command.name}</span>
						{command.description ? <span className="block truncate text-xs text-text-tertiary">{command.description}</span> : null}
					</span>
					<span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-xs text-text-muted">
						{command.source}
					</span>
				</motion.button>
			))}
		</motion.div>
	);
}

function extractCommandQuery(value: string): string {
	const trimmed = value.trimStart();
	if (!trimmed.startsWith("/")) return "";
	return trimmed.slice(1).split(/\s/, 1)[0] ?? "";
}
