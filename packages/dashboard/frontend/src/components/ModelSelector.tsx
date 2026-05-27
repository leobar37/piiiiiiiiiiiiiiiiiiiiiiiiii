/**
 * ModelSelector — compact dropdown for picking the active LLM model.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useSessionModel } from "../store/index.js";
import { orpc } from "../orpc.js";
import type { ModelInfo } from "../api-types.js";

interface ModelSelectorProps {
	sessionId: string;
}

function IconChevronDown(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
		</svg>
	);
}

function IconCheck(props: { className?: string }) {
	return (
		<svg className={props.className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
		</svg>
	);
}

export function ModelSelector({ sessionId }: ModelSelectorProps) {
	const currentModel = useSessionModel(sessionId);
	const [isOpen, setIsOpen] = useState(false);
	const [models, setModels] = useState<ModelInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [displayModel, setDisplayModel] = useState<ModelInfo | undefined>(undefined);
	const ref = useRef<HTMLDivElement>(null);

	const activeModel = displayModel ?? currentModel;

	// Close on outside click
	useEffect(() => {
		if (!isOpen) return;
		function handleClick(event: MouseEvent) {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [isOpen]);

	const handleOpen = useCallback(async () => {
		setIsOpen(true);
		setLoading(true);
		setError(null);
		try {
			const result = await orpc.sessions.models.list({ sessionId });
			setModels(result.models);
			if (result.current) {
				setDisplayModel(undefined);
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			setError(message);
			console.error("Failed to load models", e);
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	const handleSelect = useCallback(
		async (model: ModelInfo) => {
			setIsOpen(false);
			setDisplayModel(model);
			try {
				await orpc.sessions.models.set({
					sessionId,
					provider: model.provider,
					modelId: model.id,
				});
			} catch (e) {
				console.error("Failed to set model", e);
				setDisplayModel(undefined);
			}
		},
		[sessionId],
	);

	const grouped = models.reduce<Record<string, ModelInfo[]>>((acc, model) => {
		if (!acc[model.provider]) acc[model.provider] = [];
		acc[model.provider].push(model);
		return acc;
	}, {});

	const providers = Object.keys(grouped).sort();

	const buttonLabel = activeModel
		? `${activeModel.provider} / ${activeModel.name}`
		: "Select model";

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => {
					if (isOpen) {
						setIsOpen(false);
					} else {
						handleOpen();
					}
				}}
				className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors bg-transparent border border-border-subtle hover:border-border-default rounded-md px-2 py-1 max-w-[200px]"
				title={buttonLabel}
			>
				<span className="truncate">{buttonLabel}</span>
				<IconChevronDown className="w-3 h-3 shrink-0" />
			</button>

			{isOpen && (
				<div className="absolute right-0 top-full mt-1 w-64 bg-bg-elevated border border-border-subtle rounded-md shadow-md z-50 max-h-60 overflow-y-auto">
					{loading && (
						<div className="px-3 py-2 text-xs text-text-muted">Loading...</div>
					)}
					{error && (
						<div className="px-3 py-2 text-xs text-error">Error: {error}</div>
					)}
					{!loading && !error && models.length === 0 && (
						<div className="px-3 py-2 text-xs text-text-muted">No models available</div>
					)}
					{providers.map((provider) => (
						<div key={provider}>
							<div className="px-3 py-1.5 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider sticky top-0 bg-bg-elevated">
								{provider}
							</div>
							{grouped[provider].map((model) => {
								const isSelected =
									activeModel?.provider === model.provider && activeModel?.id === model.id;
								return (
									<button
										key={`${model.provider}-${model.id}`}
										type="button"
										onClick={() => handleSelect(model)}
										className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-bg-hover transition-colors ${
											isSelected ? "text-text-primary bg-bg-active" : "text-text-secondary"
										}`}
										title={model.name}
									>
										<span className="truncate">{model.name}</span>
										{isSelected && <IconCheck className="w-3 h-3 shrink-0 text-accent" />}
									</button>
								);
							})}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
