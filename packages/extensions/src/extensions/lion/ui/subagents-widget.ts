import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, Container, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { LionRuntime, LionSubagentUiState } from "../runtime.js";

const LION_SUBAGENT_WIDGET_KEY = "lion-subagents";
const WIDGET_ANIMATION_MS = 120;

interface RenderRequestUi {
	requestRender?: () => void;
}

function elapsed(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m${Math.floor(seconds % 60)
		.toString()
		.padStart(2, "0")}s`;
}

function glyph(state: LionSubagentUiState, theme: Theme): string {
	if (state.status === "queued") return theme.fg("muted", "◦");
	if (state.status === "running") return theme.fg("accent", "●");
	if (state.status === "completed") return theme.fg("success", "✓");
	return theme.fg("error", "✗");
}

function statJoin(theme: Theme, parts: string[]): string {
	return parts
		.filter(Boolean)
		.map((part) => theme.fg("dim", part))
		.join(` ${theme.fg("dim", "·")} `);
}

function lineWidth(): number {
	return process.stdout.columns || 120;
}

function clip(line: string, width: number): string {
	if (visibleWidth(line) <= width) return line;
	return truncateToWidth(line, width);
}

function stateStats(state: LionSubagentUiState, now: number, theme: Theme): string {
	const parts = [
		state.turnCount > 0 ? `${state.turnCount} turn${state.turnCount === 1 ? "" : "s"}` : "",
		state.toolCount > 0 ? `${state.toolCount} tool use${state.toolCount === 1 ? "" : "s"}` : "",
		elapsed((state.completedAt ?? now) - state.startedAt),
	];
	return statJoin(theme, parts);
}

export function buildLionSubagentWidgetLines(
	states: Iterable<LionSubagentUiState>,
	theme: Theme,
	width = lineWidth(),
	now = Date.now(),
): string[] {
	const ordered = [...states].sort((left, right) => {
		const statusScore = (state: LionSubagentUiState) =>
			state.status === "running" ? 0 : state.status === "queued" ? 1 : 2;
		return statusScore(left) - statusScore(right) || right.updatedAt - left.updatedAt;
	});
	if (ordered.length === 0) return [];

	const active = ordered.some((state) => state.status === "running" || state.status === "queued");
	const lines = [
		clip(
			`${theme.fg(active ? "accent" : "dim", active ? "●" : "○")} ${theme.fg("toolTitle", theme.bold("Lion subagents"))} ${theme.fg("dim", "· live")}`,
			width,
		),
	];

	for (const state of ordered.slice(0, 4)) {
		const stats = stateStats(state, now, theme);
		const activity = state.currentTool
			? `${state.currentTool}`
			: state.summary
					?.split("\n")
					.find((line) => line.trim())
					?.trim();
		lines.push(
			clip(
				`${glyph(state, theme)} ${theme.bold(state.role)} ${theme.fg("accent", state.taskId)} ${theme.fg("dim", "·")} ${theme.fg("dim", state.status)}${state.definition ? ` ${theme.fg("dim", "·")} ${state.definition}` : ""}${stats ? ` ${theme.fg("dim", "·")} ${stats}` : ""}`,
				width,
			),
		);
		if (activity) lines.push(clip(`  ${theme.fg("dim", `⎿  ${activity}`)}`, width));
	}

	const hidden = ordered.length - 4;
	if (hidden > 0) lines.push(clip(theme.fg("dim", `+${hidden} more Lion subagents`), width));
	return lines;
}

function buildWidgetComponent(runtime: LionRuntime): (_tui: unknown, theme: Theme) => Component {
	return (_tui, theme) => {
		const container = new Container();
		for (const line of buildLionSubagentWidgetLines(runtime.subagentUi.values(), theme)) {
			container.addChild(new Text(line, 1, 0));
		}
		return container;
	};
}

function hasRunningSubagent(runtime: LionRuntime): boolean {
	return [...runtime.subagentUi.values()].some((state) => state.status === "running" || state.status === "queued");
}

export function stopLionSubagentWidget(runtime: LionRuntime): void {
	if (runtime.widgetTimer) {
		clearInterval(runtime.widgetTimer);
		runtime.widgetTimer = null;
	}
	if (runtime.lastUiContext?.hasUI) runtime.lastUiContext.ui.setWidget(LION_SUBAGENT_WIDGET_KEY, undefined);
}

export function renderLionSubagentWidget(runtime: LionRuntime, ctx?: ExtensionContext): void {
	const uiContext = ctx?.hasUI ? ctx : runtime.lastUiContext;
	if (!uiContext?.hasUI) return;
	runtime.lastUiContext = uiContext;
	runtime.cleanupSubagentUi();
	if (runtime.subagentUi.size === 0) {
		stopLionSubagentWidget(runtime);
		return;
	}

	uiContext.ui.setWidget(LION_SUBAGENT_WIDGET_KEY, buildWidgetComponent(runtime));
	requestRender(uiContext);

	if (!hasRunningSubagent(runtime)) {
		if (runtime.widgetTimer) {
			clearInterval(runtime.widgetTimer);
			runtime.widgetTimer = null;
		}
		return;
	}

	if (runtime.widgetTimer) return;
	runtime.widgetTimer = setInterval(() => {
		const latestContext = runtime.lastUiContext;
		if (!latestContext?.hasUI) return;
		runtime.cleanupSubagentUi();
		if (runtime.subagentUi.size === 0) {
			stopLionSubagentWidget(runtime);
			return;
		}
		latestContext.ui.setWidget(LION_SUBAGENT_WIDGET_KEY, buildWidgetComponent(runtime));
		requestRender(latestContext);
	}, WIDGET_ANIMATION_MS);
	runtime.widgetTimer.unref?.();
}

function requestRender(ctx: ExtensionContext): void {
	(ctx.ui as RenderRequestUi).requestRender?.();
}
