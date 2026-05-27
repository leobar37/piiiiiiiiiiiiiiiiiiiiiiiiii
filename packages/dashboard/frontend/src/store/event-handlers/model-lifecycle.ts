import type { ServerEvent } from "@local/pi-dashboard";
import type { SessionRuntime } from "../runtime.js";

export function handleModelSelect(runtime: SessionRuntime, event: ServerEvent): void {
	if (event.type !== "model_select") return;
	const payload = (event as unknown as Record<string, unknown>).payload as
		| { provider: string; id: string; name: string; api?: string; reasoning?: boolean }
		| undefined;
	if (!payload || !event.sessionId) return;
	const entry = runtime.store.get(runtime.maps.sessions.atomFor(event.sessionId));
	if (!entry) return;
	runtime.store.set(runtime.maps.sessions.mapAtom, {
		type: "set",
		key: event.sessionId,
		value: {
			...entry,
			model: {
				provider: payload.provider,
				id: payload.id,
				name: payload.name,
				api: payload.api ?? "",
				reasoning: payload.reasoning ?? false,
			},
		},
	});
}
