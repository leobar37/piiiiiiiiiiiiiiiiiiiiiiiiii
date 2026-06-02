import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncDashboardQueries, syncMessageQuery } from "../src/hooks/use-sse.ts";
import { queryClient } from "../src/lib/query-client.ts";
import { useSessionMessagesStore } from "../src/store/session-messages.ts";
import type { ChatMessage, SubAgentInstanceState } from "../src/types.ts";

describe("useSseEvents query synchronization", () => {
	beforeEach(() => {
		vi.spyOn(console, "debug").mockImplementation(() => {});
	});

	afterEach(() => {
		queryClient.clear();
		useSessionMessagesStore.getState().clearMessages("main:session-1");
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("updates cached thread lists from instance.state events", () => {
		const initial: SubAgentInstanceState = {
			instanceId: "subagent-task-1",
			taskId: "task-1",
			definitionName: "executor",
			kind: "subagent",
			description: "Old state",
			state: "created",
			startTime: null,
			endTime: null,
			turnCount: 0,
			lastActivityAt: 1,
			currentTool: null,
			error: null,
			toolCount: 0,
			currentToolStartedAt: null,
			durationMs: 0,
		};
		const next: SubAgentInstanceState = {
			...initial,
			description: "Running state",
			state: "running",
			startTime: 10,
			lastActivityAt: 20,
			currentTool: "read",
		};

		queryClient.setQueryData<SubAgentInstanceState[]>(["agents"], [initial]);
		syncDashboardQueries({
			type: "instance.state",
			instanceId: next.instanceId,
			taskId: next.taskId,
			state: next,
			timestamp: 20,
		});

		expect(queryClient.getQueryData(["agents"])).toEqual([next]);
		expect(queryClient.getQueryData(["agent", next.instanceId])).toEqual(next);
	});

	it("marks task completion in cached threads and invalidates durable run data", async () => {
		vi.useFakeTimers();
		const thread: SubAgentInstanceState = {
			instanceId: "subagent-task-1",
			taskId: "task-1",
			definitionName: "executor",
			kind: "subagent",
			state: "running",
			startTime: 10,
			endTime: null,
			turnCount: 1,
			lastActivityAt: 20,
			currentTool: "read",
			error: null,
			toolCount: 1,
			currentToolStartedAt: 20,
			durationMs: 10,
		};

		const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
		queryClient.setQueryData<SubAgentInstanceState[]>(["agents"], [thread]);
		queryClient.setQueryData<SubAgentInstanceState>(["agent", thread.instanceId], thread);

		syncDashboardQueries({
			type: "task.end",
			instanceId: thread.instanceId,
			taskId: thread.taskId,
			result: { status: "completed" },
			timestamp: 30,
		});

		expect(queryClient.getQueryData<SubAgentInstanceState[]>(["agents"])?.[0]).toMatchObject({
			state: "completed",
			currentTool: null,
			currentToolStartedAt: null,
		});

		await vi.advanceTimersByTimeAsync(50);
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["agent-run", thread.instanceId] });
	});

	it("syncs message cache from the message store", () => {
		const message: ChatMessage = {
			id: "msg-1",
			instanceId: "main:session-1",
			role: "assistant",
			blocks: [{ type: "text", text: "done" }],
			timestamp: 10,
		};

		useSessionMessagesStore.getState().setMessages("main:session-1", [message]);
		syncMessageQuery("main:session-1");

		expect(queryClient.getQueryData(["agent-messages", "main:session-1"])).toEqual([message]);
	});
});
