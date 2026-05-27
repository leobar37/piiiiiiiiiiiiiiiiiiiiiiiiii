import type { LionRuntime } from "./runtime.js";

export function startLionDashboard(_runtime: LionRuntime): { start: () => Promise<URL>; stop: () => Promise<void> } {
	return {
		async start() {
			return new URL("http://localhost:0");
		},
		async stop() {},
	};
}
