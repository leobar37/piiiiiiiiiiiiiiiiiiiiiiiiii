import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { LION_MESSAGE_TYPE, type LionState } from "./types.js";

export class LionUI {
	constructor(private readonly pi: ExtensionAPI) {}

	showMessage(content: string): void {
		this.pi.sendMessage({ customType: LION_MESSAGE_TYPE, content, display: true }, { triggerTurn: false });
	}

	updateStatus(ctx: ExtensionContext, state: LionState): void {
		if (!ctx.hasUI) return;
		if (!state.active) {
			ctx.ui.setStatus("lion", undefined);
			return;
		}
		const plan = state.activePlanSlug ? `: ${state.activePlanSlug}` : "";
		ctx.ui.setStatus("lion", ctx.ui.theme.fg("accent", `Lion ${state.mode}${plan}`));
	}

	clearStatus(ctx: ExtensionContext): void {
		if (ctx.hasUI) ctx.ui.setStatus("lion", undefined);
	}
}
