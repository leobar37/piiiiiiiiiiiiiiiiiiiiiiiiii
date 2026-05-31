import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MainSessionBridge } from "../../src/lion/main-session.js";

function createCtx(): ExtensionContext {
	return {
		isIdle: () => false,
		sessionManager: {
			getSessionId: () => "session-1",
			getSessionName: () => "Main",
			getSessionFile: () => "/tmp/session.jsonl",
			getEntries: () => [],
			getLeafId: () => undefined,
		},
		model: { provider: "test-provider", id: "test-model" },
	} as unknown as ExtensionContext;
}

describe("MainSessionBridge timing", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("tracks the current main execution duration instead of accumulating across executions", () => {
		vi.useFakeTimers();
		const bridge = new MainSessionBridge();
		const ctx = createCtx();

		vi.setSystemTime(1000);
		bridge.record({ type: "agent_start" }, ctx);
		vi.setSystemTime(1600);
		bridge.record({ type: "agent_end", messages: [] }, ctx);
		expect(bridge.getThread()?.durationMs).toBe(600);

		vi.setSystemTime(5000);
		bridge.record({ type: "agent_start" }, ctx);
		vi.setSystemTime(5300);
		bridge.record({ type: "agent_end", messages: [] }, ctx);

		expect(bridge.getThread()?.startTime).toBe(5000);
		expect(bridge.getThread()?.durationMs).toBe(300);
	});

	it("tracks the active main-session tool start time", () => {
		vi.useFakeTimers();
		const bridge = new MainSessionBridge();
		const ctx = createCtx();

		vi.setSystemTime(1000);
		bridge.record({ type: "agent_start" }, ctx);
		vi.setSystemTime(1200);
		bridge.record({ type: "tool_execution_start", toolName: "lion_tasks", toolCallId: "tool-1", args: {} }, ctx);

		expect(bridge.getThread()?.currentTool).toBe("lion_tasks");
		expect(bridge.getThread()?.currentToolStartedAt).toBe(1200);

		vi.setSystemTime(1400);
		bridge.record(
			{ type: "tool_execution_end", toolName: "lion_tasks", toolCallId: "tool-1", result: {}, isError: false },
			ctx,
		);

		expect(bridge.getThread()?.currentTool).toBeNull();
		expect(bridge.getThread()?.currentToolStartedAt).toBeNull();
	});
});
