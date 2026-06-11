import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, LayoutList, ListTodo, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useClickOutside } from "../hooks/use-click-outside.ts";
import { useLionState } from "../hooks/use-lion-state.ts";
import { useSetLionStrategy } from "../hooks/use-set-lion-strategy.ts";
import { canChangeLionStrategy, type LionStrategyName } from "../lib/can-change-lion-strategy.ts";

const STRATEGY_ITEMS: { value: LionStrategyName; label: string; description: string; icon: typeof Sparkles }[] = [
	{
		value: "none",
		label: "Normal",
		description: "No Lion planning",
		icon: Sparkles,
	},
	{
		value: "simple",
		label: "Simple",
		description: "Light planning with subagents",
		icon: LayoutList,
	},
	{
		value: "plan",
		label: "Plan",
		description: "Full durable plan",
		icon: ListTodo,
	},
];

export function LionModeSelector() {
	const { data: lionState } = useLionState();
	const setStrategy = useSetLionStrategy();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const shouldReduceMotion = useReducedMotion();

	useClickOutside(ref, () => setOpen(false));

	const currentStrategy = lionState?.strategy ?? "none";
	const currentItem = STRATEGY_ITEMS.find((item) => item.value === currentStrategy) ?? STRATEGY_ITEMS[0];
	const CurrentIcon = currentItem.icon;

	function handleSelect(strategy: LionStrategyName) {
		if (strategy === currentStrategy) {
			setOpen(false);
			return;
		}
		void setStrategy.mutateAsync({ strategy });
		setOpen(false);
	}

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				disabled={setStrategy.isPending}
				className="flex max-w-[10rem] shrink min-w-0 items-center gap-1.5 rounded border border-border-subtle bg-bg px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-border-hover hover:text-text-primary disabled:opacity-60"
				aria-expanded={open}
				title={`Lion mode: ${currentItem.label}`}
			>
				<CurrentIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				<span className="truncate">{currentItem.label}</span>
				<ChevronDown
					className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
					aria-hidden="true"
				/>
			</button>

			<AnimatePresence>
				{open ? (
					<motion.div
						className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-lg border border-border-default bg-bg-elevated p-1 shadow-md"
						initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={shouldReduceMotion ? undefined : { opacity: 0, y: 4, scale: 0.99 }}
						transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
					>
						{STRATEGY_ITEMS.map((item, index) => {
							const selected = item.value === currentStrategy;
							const allowed = canChangeLionStrategy(lionState, item.value);
							const Icon = item.icon;
							return (
								<motion.button
									key={item.value}
									type="button"
									onClick={() => handleSelect(item.value)}
									disabled={!allowed}
									className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors ${
										selected
											? "bg-accent-muted"
											: allowed
												? "hover:bg-bg-hover"
												: "cursor-not-allowed opacity-50"
									}`}
									initial={shouldReduceMotion ? false : { opacity: 0, x: -4 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ duration: 0.14, delay: shouldReduceMotion ? 0 : Math.min(index * 0.01, 0.08) }}
								>
									<Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium text-text-primary">{item.label}</span>
										<span className="block truncate text-xs text-text-tertiary">{item.description}</span>
									</span>
									{selected ? <Check className="h-4 w-4 shrink-0 text-success" aria-label="Selected" /> : null}
								</motion.button>
							);
						})}
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
