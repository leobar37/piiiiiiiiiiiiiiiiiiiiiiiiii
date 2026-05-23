import { describe, expect, it } from "vitest";
import { SubAgentEvents } from "../src/event-defs.js";
import type { SubAgentEvent } from "../src/types.js";

describe("SubAgentEvents", () => {
	it("provides lifecycleChange event creator", () => {
		const event = SubAgentEvents.lifecycleChange({
			instanceId: "inst-1",
			previous: "created",
			current: "running",
		});
		expect(event.type).toBe("lifecycle.change");
		expect(event.payload.instanceId).toBe("inst-1");
		expect(event.payload.previous).toBe("created");
		expect(event.payload.current).toBe("running");
	});

	it("provides taskStart event creator", () => {
		const event = SubAgentEvents.taskStart({
			instanceId: "inst-1",
			taskId: "task-1",
			definitionName: "analyzer",
			description: "Test task",
		});
		expect(event.type).toBe("task.start");
		expect(event.payload.taskId).toBe("task-1");
	});

	it("provides taskEnd event creator", () => {
		const event = SubAgentEvents.taskEnd({
			instanceId: "inst-1",
			taskId: "task-1",
			result: {
				taskId: "task-1",
				agent: "analyzer",
				status: "completed",
				summary: "Done",
				duration: 100,
				turnCount: 3,
				finalState: {} as any,
			},
		});
		expect(event.type).toBe("task.end");
		expect(event.payload.result.status).toBe("completed");
	});

	it("provides turnComplete event creator", () => {
		const event = SubAgentEvents.turnComplete({
			instanceId: "inst-1",
			taskId: "task-1",
			turnIndex: 0,
			toolCount: 2,
			hadError: false,
		});
		expect(event.type).toBe("turn.complete");
		expect(event.payload.turnIndex).toBe(0);
		expect(event.payload.toolCount).toBe(2);
	});

	it("provides toolExecute event creator", () => {
		const event = SubAgentEvents.toolExecute({
			instanceId: "inst-1",
			taskId: "task-1",
			toolName: "read",
			toolCallId: "call-1",
			isError: false,
		});
		expect(event.type).toBe("tool.execute");
		expect(event.payload.toolName).toBe("read");
	});

	it("provides progressUpdate event creator", () => {
		const event = SubAgentEvents.progressUpdate({
			instanceId: "inst-1",
			taskId: "task-1",
			message: "Working...",
		});
		expect(event.type).toBe("progress.update");
		expect(event.payload.message).toBe("Working...");
	});

	it("provides queryResponse event creator", () => {
		const event = SubAgentEvents.queryResponse({
			instanceId: "inst-1",
			taskId: "task-1",
			queryId: "q-1",
			question: "What?",
			answer: "42",
		});
		expect(event.type).toBe("query.response");
		expect(event.payload.answer).toBe("42");
	});

	it("provides summaryAvailable event creator", () => {
		const event = SubAgentEvents.summaryAvailable({
			instanceId: "inst-1",
			taskId: "task-1",
			summary: "Summary text",
			messageCount: 5,
		});
		expect(event.type).toBe("summary.available");
		expect(event.payload.messageCount).toBe(5);
	});

	it("provides error event creator", () => {
		const event = SubAgentEvents.error({
			instanceId: "inst-1",
			taskId: "task-1",
			error: "Something broke",
			fatal: true,
		});
		expect(event.type).toBe("error");
		expect(event.payload.fatal).toBe(true);
	});

	it("all event creators produce events with timestamp and id", () => {
		for (const [key, creator] of Object.entries(SubAgentEvents)) {
			const event = (creator as unknown as (payload: Record<string, unknown>) => SubAgentEvent)({
				instanceId: "inst-1",
				taskId: "task-1",
				...getMinimalPayload(key),
			});
			expect(event).toHaveProperty("type");
			expect(event).toHaveProperty("timestamp");
			expect(typeof event.timestamp).toBe("number");
			expect(event).toHaveProperty("id");
		}
	});
});

function getMinimalPayload(key: string): Record<string, unknown> {
	const payloads: Record<string, Record<string, unknown>> = {
		lifecycleChange: { previous: "a", current: "b" },
		taskStart: { definitionName: "d" },
		taskEnd: {
			result: {
				taskId: "t",
				agent: "a",
				status: "completed",
				summary: "s",
				duration: 0,
				turnCount: 0,
				finalState: {},
			},
		},
		turnComplete: { turnIndex: 0, toolCount: 0, hadError: false },
		toolExecute: { toolName: "t", toolCallId: "c", isError: false },
		progressUpdate: { message: "m" },
		queryResponse: { queryId: "q", question: "q", answer: "a" },
		summaryAvailable: { summary: "s", messageCount: 0 },
		error: { error: "e", fatal: false },
	};
	return payloads[key] ?? {};
}
