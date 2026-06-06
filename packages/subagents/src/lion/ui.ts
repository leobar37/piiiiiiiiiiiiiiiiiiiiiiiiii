import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { LionState } from "./types.js";

const LION_MESSAGE_TYPE = "lion-message";

export class LionUI {
	constructor(private readonly pi: ExtensionAPI) {}

	showMessage(content: string): void {
		this.pi.sendMessage({ customType: LION_MESSAGE_TYPE, content, display: true }, { triggerTurn: false });
	}

	updateStatus(ctx: ExtensionContext, state: LionState): void {
		if (!ctx.hasUI) return;
		if (!state.active) {
			ctx.ui.setStatus("lion", undefined);
			ctx.ui.setStatus("lion-dashboard", undefined);
			return;
		}
		const plan = state.activePlanSlug ? `: ${state.activePlanSlug}` : "";
		ctx.ui.setStatus("lion", ctx.ui.theme.fg("accent", `Lion ${state.strategy}/${state.phase}${plan}`));
	}

	showDashboardUrl(ctx: ExtensionContext, url: URL): void {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus("lion-dashboard", ctx.ui.theme.fg("muted", `Dashboard ${url.href}`));
	}

	clearStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus("lion", undefined);
		ctx.ui.setStatus("lion-dashboard", undefined);
	}
}
