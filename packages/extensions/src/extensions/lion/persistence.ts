import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createInitialLionState } from "./state.js";
import { LION_STATE_ENTRY_TYPE, type LionState, type PersistedLionState } from "./types.js";

export function buildPersistedLionState(state: LionState, action: PersistedLionState["action"]): PersistedLionState {
	return { ...state, action, updatedAt: Date.now() };
}

export function restoreLionState(ctx: ExtensionContext): LionState {
	let lastState: PersistedLionState | undefined;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type !== "custom" || entry.customType !== LION_STATE_ENTRY_TYPE) continue;
		lastState = entry.data as PersistedLionState | undefined;
	}
	if (!lastState || lastState.version !== 1) return createInitialLionState();
	const { action: _action, updatedAt: _updatedAt, ...state } = lastState;
	return state;
}

export function persistLionState(pi: ExtensionAPI, state: LionState, action: PersistedLionState["action"]): void {
	pi.appendEntry(LION_STATE_ENTRY_TYPE, buildPersistedLionState(state, action));
}
