import { describe, expect, it, vi } from "vitest";
import { syncDashboardQueries } from "../src/hooks/use-sse";
import { getTaskListQueryKey } from "../src/lib/task-query-cache";
import { queryClient } from "../src/lib/query-client";
import type { SubAgentEvent, TaskRecord } from "../src/types";

const task: TaskRecord = {
	id: "deadbeef",
	title: "Review SSE invalidation",
	status: "pending",
	createdAt: "2026-06-12T00:00:00.000Z",
	updatedAt: "2026-06-12T00:00:00.000Z",
	revision: 1,
};

describe("SSE task cache sync", () => {
	it("invalidates task queries for global task change events", () => {
		const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

		const event: SubAgentEvent = {
			type: "task.changed",
			action: "updated",
			taskId: task.id,
			task,
			timestamp: Date.now(),
		};

		syncDashboardQueries(event);

		expect(invalidate).toHaveBeenCalledWith({ queryKey: getTaskListQueryKey(false) });
		expect(invalidate).toHaveBeenCalledWith({ queryKey: getTaskListQueryKey(true) });
		invalidate.mockRestore();
	});
});
