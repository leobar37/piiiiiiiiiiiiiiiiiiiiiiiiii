import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { LION_MESSAGE_TYPE, type LionState } from "./types.js";

export function showLionMessage(pi: ExtensionAPI, content: string): void {
	pi.sendMessage({ customType: LION_MESSAGE_TYPE, content, display: true }, { triggerTurn: false });
}

export function updateLionStatus(ctx: ExtensionContext, state: LionState): void {
	if (!ctx.hasUI) return;
	if (!state.active) {
		ctx.ui.setStatus("lion", undefined);
		return;
	}
	const plan = state.activePlanSlug ? `: ${state.activePlanSlug}` : "";
	ctx.ui.setStatus("lion", ctx.ui.theme.fg("accent", `Lion ${state.mode}${plan}`));
}
