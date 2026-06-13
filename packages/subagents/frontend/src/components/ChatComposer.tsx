import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Paperclip, SendHorizontal, Square, Terminal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, KeyboardEvent } from "react";
import { useThreadCommands } from "../hooks/use-thread-commands.ts";
import { useSelectThreadModel, useThreadModels } from "../hooks/use-thread-models.ts";
import { type ComposerMode, useSendThreadMessage } from "../hooks/use-send-thread-message.ts";
import { useAbortThreadMessage } from "../hooks/use-abort-thread-message.ts";
import { useSessionMessagesStore } from "../store/session-messages.ts";
import type { DashboardImageAttachment, DashboardModel, SubAgentInstanceState } from "../types.ts";
import { LionModeSelector } from "./LionModeSelector.tsx";

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
	const [attachments, setAttachments] = useState<DashboardImageAttachment[]>([]);
	const [mode, setMode] = useState<ComposerMode>("prompt");
	const [commandsOpen, setCommandsOpen] = useState(false);
	const [modelsOpen, setModelsOpen] = useState(false);
	const [isFocused, setIsFocused] = useState(false);
	const [abortRequested, setAbortRequested] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const shouldReduceMotion = useReducedMotion();
	const sendMessage = useSendThreadMessage();
	const abortMessage = useAbortThreadMessage();
	const selectModel = useSelectThreadModel();
	const isStreaming = useSessionMessagesStore((state) =>
		state.streamingByInstance.get(instanceId) ?? false,
	);
	const { data: commands = [] } = useThreadCommands(instanceId);
	const { data: models = [] } = useThreadModels(instanceId);
	const query = extractCommandQuery(message);
	const commandIntent = message.trimStart().startsWith("/");
	const currentModel = useMemo(
		() => resolveCurrentModel(models, thread?.modelProvider, thread?.modelId),
		[models, thread?.modelId, thread?.modelProvider],
	);
	const abortError = abortMessage.error;
	const actionError = abortError ?? sendMessage.error ?? selectModel.error;
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
	const canSend = Boolean(thread && (trimmed || attachments.length > 0) && !sendMessage.isPending);
	const isSelectingModel = selectModel.isPending;
	const canAbort = isStreaming && !abortMessage.isPending && !abortRequested;
	const statusText = abortMessage.isPending
		? "Stopping..."
		: sendMessage.isPending
			? "Sending..."
			: isSelectingModel
				? "Selecting model"
				: null;

	useEffect(() => {
		if (!isStreaming) {
			setAbortRequested(false);
		}
	}, [isStreaming]);

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
			if (isStreaming) {
				event.preventDefault();
				void handleAbort();
				return;
			}
			setCommandsOpen(false);
			return;
		}
		if (event.key === "Tab" && commandsOpen && commandIntent && filteredCommands.length > 0) {
			event.preventDefault();
			insertCommand(filteredCommands[0].name);
			return;
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			void submit();
		}
	}

	async function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
		const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
		if (images.length === 0) return;
		event.preventDefault();
		await addImageFiles(images);
	}

	async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
		event.target.value = "";
		await addImageFiles(files);
	}

	async function addImageFiles(files: File[]) {
		if (files.length === 0) return;
		const next = await Promise.all(files.map(readImageAttachment));
		setAttachments((current) => [...current, ...next]);
	}

	function removeAttachment(index: number) {
		setAttachments((current) => current.filter((_, candidateIndex) => candidateIndex !== index));
	}

	async function submit() {
		if (!canSend) return;
		const outbound = trimmed;
		const outboundAttachments = attachments;
		setMessage("");
		setAttachments([]);
		setCommandsOpen(false);
		if (textareaRef.current) textareaRef.current.style.height = "44px";
		try {
			await sendMessage.mutateAsync({ threadId: instanceId, message: outbound, mode, images: outboundAttachments });
		} catch {
			setMessage(outbound);
			setAttachments(outboundAttachments);
		}
	}

	async function handleAbort() {
		if (!canAbort) return;
		setAbortRequested(true);
		try {
			await abortMessage.mutateAsync({ threadId: instanceId });
		} catch (err) {
			setAbortRequested(false);
			console.error("Failed to abort:", err);
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

	function handleModelSelect(model: DashboardModel) {
		setModelsOpen(false);
		if (!thread) return;
		if (thread.modelProvider === model.provider && thread.modelId === model.id) return;
		selectModel.mutate({ threadId: instanceId, provider: model.provider, modelId: model.id });
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
				<AnimatePresence>
					{modelsOpen && models.length > 0 ? (
						<ModelPalette
							currentModel={currentModel}
							models={models}
							onSelect={handleModelSelect}
							shouldReduceMotion={shouldReduceMotion}
						/>
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
					onPaste={(event) => void handlePaste(event)}
					className="min-h-11 resize-none bg-transparent px-4 py-3 text-sm leading-normal text-text-primary outline-none placeholder:text-text-tertiary"
				/>

				{attachments.length > 0 ? (
					<div className="flex min-w-0 flex-wrap gap-2 px-3 pb-3">
						{attachments.map((attachment, index) => (
							<div
								key={`${attachment.name ?? attachment.mimeType}-${index}`}
								className="group/attachment relative h-14 w-14 overflow-hidden rounded-md border border-border-subtle bg-bg-base"
							>
								<img
									src={`data:${attachment.mimeType};base64,${attachment.data}`}
									alt={attachment.name ?? "Attached image"}
									className="h-full w-full object-cover"
								/>
								<button
									type="button"
									onClick={() => removeAttachment(index)}
									title="Remove image"
									aria-label="Remove image"
									className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-base/85 text-text-secondary opacity-0 transition hover:text-text-primary group-hover/attachment:opacity-100"
								>
									<X className="h-3 w-3" aria-hidden="true" />
								</button>
							</div>
						))}
					</div>
				) : null}

				<div className="flex items-center justify-between gap-3 px-3 pb-3">
					<div className="flex min-w-0 items-center gap-2">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							multiple
							onChange={(event) => void handleFileChange(event)}
							className="hidden"
						/>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							title="Attach images"
							aria-label="Attach images"
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border-subtle bg-bg text-text-secondary transition hover:border-border-hover hover:text-text-primary"
						>
							<Paperclip className="h-4 w-4" aria-hidden="true" />
						</button>
						<ModelButton
							currentModel={currentModel}
							fallbackProvider={thread?.modelProvider}
							fallbackModelId={thread?.modelId}
							isOpen={modelsOpen}
							onClick={() => setModelsOpen((open) => !open)}
						/>
						<LionModeSelector />
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
							{actionError ? (
								<motion.span
									className="max-w-64 truncate text-xs text-error"
									title={actionError.message}
									initial={shouldReduceMotion ? false : { opacity: 0, x: 6 }}
									animate={{ opacity: 1, x: 0 }}
									exit={shouldReduceMotion ? undefined : { opacity: 0, x: 6 }}
									transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
								>
									{actionError.message}
								</motion.span>
							) : null}
						</AnimatePresence>
						<motion.button
							type="button"
							onClick={() => void (isStreaming ? handleAbort() : submit())}
							disabled={isStreaming ? !canAbort : !canSend}
							whileTap={
								shouldReduceMotion || (isStreaming ? !canAbort : !canSend) ? undefined : { scale: 0.94 }
							}
							whileHover={
								shouldReduceMotion || (isStreaming ? !canAbort : !canSend) ? undefined : { scale: 1.04 }
							}
							className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
								isStreaming
									? "bg-error text-bg-base hover:bg-error-hover disabled:cursor-not-allowed disabled:bg-text-muted disabled:text-bg-surface"
									: "bg-text-primary text-bg-base hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-text-muted disabled:text-bg-surface"
							}`}
							title={isStreaming ? "Stop" : "Send"}
							aria-label={isStreaming ? "Stop" : "Send"}
						>
							{isStreaming ? (
								<Square className="h-4 w-4" aria-hidden="true" />
							) : (
								<SendHorizontal className="h-4 w-4" aria-hidden="true" />
							)}
						</motion.button>
					</div>
				</div>
			</motion.div>
		</div>
	);
}

async function readImageAttachment(file: File): Promise<DashboardImageAttachment> {
	const dataUrl = await readFileAsDataUrl(file);
	const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
	return {
		type: "image",
		data: base64,
		mimeType: file.type || "image/png",
		name: file.name,
	};
}

function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
				return;
			}
			reject(new Error("Image file could not be read"));
		};
		reader.onerror = () => reject(reader.error ?? new Error("Image file could not be read"));
		reader.readAsDataURL(file);
	});
}

interface ModelButtonProps {
	currentModel?: DashboardModel;
	fallbackProvider?: string;
	fallbackModelId?: string;
	isOpen: boolean;
	onClick(): void;
}

function ModelButton({ currentModel, fallbackProvider, fallbackModelId, isOpen, onClick }: ModelButtonProps) {
	const label = currentModel?.name ?? formatModelLabel(fallbackProvider, fallbackModelId) ?? "Model";
	const title = currentModel ? `${currentModel.provider}/${currentModel.id}` : label;

	return (
		<button
			type="button"
			onClick={onClick}
			className="flex max-w-[16rem] shrink min-w-0 items-center gap-1.5 rounded border border-border-subtle bg-bg px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-border-hover hover:text-text-primary"
			title={title}
			aria-expanded={isOpen}
		>
			<span className="truncate">{label}</span>
			<ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
		</button>
	);
}

interface ModelPaletteProps {
	models: DashboardModel[];
	currentModel?: DashboardModel;
	onSelect(model: DashboardModel): void;
	shouldReduceMotion: boolean | null;
}

function ModelPalette({ models, currentModel, onSelect, shouldReduceMotion }: ModelPaletteProps) {
	return (
		<motion.div
			className="absolute bottom-full left-3 mb-2 max-h-80 w-[min(36rem,calc(100vw-3rem))] overflow-y-auto rounded-lg border border-border-default bg-bg-elevated p-1 shadow-md"
			initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={shouldReduceMotion ? undefined : { opacity: 0, y: 4, scale: 0.99 }}
			transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
		>
			{models.map((model, index) => {
				const selected = currentModel?.provider === model.provider && currentModel.id === model.id;
				return (
					<motion.button
						key={`${model.provider}:${model.id}`}
						type="button"
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => onSelect(model)}
						className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-bg-hover"
						initial={shouldReduceMotion ? false : { opacity: 0, x: -4 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 0.14, delay: shouldReduceMotion ? 0 : Math.min(index * 0.01, 0.08) }}
					>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-sm font-medium text-text-primary">{model.name}</span>
							<span className="block truncate text-xs text-text-tertiary">{model.provider}/{model.id}</span>
						</span>
						{model.reasoning ? (
							<span className="shrink-0 rounded border border-border-subtle px-1.5 py-0.5 text-xs text-text-muted">
								reasoning
							</span>
						) : null}
						{selected ? <Check className="h-4 w-4 shrink-0 text-success" aria-label="Selected model" /> : null}
					</motion.button>
				);
			})}
		</motion.div>
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

function resolveCurrentModel(
	models: DashboardModel[],
	provider: string | undefined,
	modelId: string | undefined,
): DashboardModel | undefined {
	if (!provider || !modelId) return undefined;
	return models.find((model) => model.provider === provider && model.id === modelId);
}

function formatModelLabel(provider: string | undefined, modelId: string | undefined): string | null {
	if (!provider || !modelId) return null;
	return `${provider}/${modelId}`;
}
