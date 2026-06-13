/**
 * Above-editor widget for goal-v2.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatElapsedSeconds } from "../../shared/utils.js";
import type { GoalCore } from "./core.js";
import { statusLabel } from "./utils.js";

export function renderGoalWidget(ctx: ExtensionContext, core: GoalCore): string[] {
	if (!ctx.hasUI) return [];

	const goal = core.goal;
	const draft = core.draft;
	const theme = ctx.ui.theme;

	if (core.mode === "drafting" && draft) {
		const objective = draft.clarifiedObjective || draft.originalObjective;
		return [theme.fg("accent", "Goal Draft"), `Status: drafting`, `Objective: ${objective}`];
	}

	if (core.mode === "auditing") {
		return [
			theme.fg("warning", "Auditing Goal"),
			`Status: auditing completion`,
			goal ? `Objective: ${goal.objective}` : "",
		].filter(Boolean);
	}

	if (!goal) {
		return [];
	}

	const lines = [
		theme.fg("accent", "Goal"),
		`Status: ${statusLabel(goal.status)}`,
		`Phase: ${goal.phase}`,
		`Objective: ${goal.objective}`,
		`Time used: ${formatElapsedSeconds(goal.timeUsedSeconds)}`,
	];
	if (goal.blockerReason) {
		lines.push(theme.fg("warning", `Blocker: ${goal.blockerReason}`));
	}
	return lines;
}

export function updateGoalWidget(ctx: ExtensionContext, core: GoalCore): void {
	if (!ctx.hasUI) return;
	const lines = renderGoalWidget(ctx, core);
	ctx.ui.setWidget("goal-v2", lines.length > 0 ? lines : undefined);
}
