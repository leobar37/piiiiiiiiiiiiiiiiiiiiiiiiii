import type { SubagentsRuntime } from "./types.js";

export const MAX_EVENT_BUFFER = 200;

export function createSubagentsRuntime(): SubagentsRuntime {
	return {
		tasks: new Map(),
		events: [],
	};
}

export function recordSubagentEvent(runtime: SubagentsRuntime, event: SubagentsRuntime["events"][number]): void {
	runtime.events.push(event);
	if (runtime.events.length > MAX_EVENT_BUFFER) {
		runtime.events.splice(0, runtime.events.length - MAX_EVENT_BUFFER);
	}
}

export async function resetSubagentsRuntime(runtime: SubagentsRuntime): Promise<void> {
	await runtime.controller?.dispose();
	runtime.controller = undefined;
	runtime.cwd = undefined;
	runtime.tasks.clear();
	runtime.events = [];
}
