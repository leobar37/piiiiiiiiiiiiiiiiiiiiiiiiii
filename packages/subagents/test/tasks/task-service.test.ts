import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import { TaskService } from "../../src/tasks/service.js";
import type { SubAgentEvent } from "../../src/types.js";

function assertTaskChanged(
	event: SubAgentEvent | undefined,
): asserts event is Extract<SubAgentEvent, { type: "task.changed" }> {
	assert.ok(event);
	assert.equal(event.type, "task.changed");
}

describe("TaskService", () => {
	it("emits task change events for mutations", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "task-service-"));
		try {
			const events: SubAgentEvent[] = [];
			const service = new TaskService(cwd, (event) => events.push(event));
			const created = await service.create({ title: "Emit task change" }, "session-1");
			assert.ok(!("error" in created));
			assert.equal(events.length, 1);
			assertTaskChanged(events[0]);
			assert.equal(events[0].taskId, created.id);
			assert.equal(events[0].action, "created");

			const completed = await service.complete(created.id, created.revision, "session-1");
			assert.ok(!("error" in completed));
			assert.equal(events.length, 2);
			assertTaskChanged(events[1]);
			assert.equal(events[1].action, "completed");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("emits derived actions and suppresses failed mutation events", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "task-service-actions-"));
		try {
			const events: SubAgentEvent[] = [];
			const service = new TaskService(cwd, (event) => events.push(event));
			const created = await service.create({ title: "Track actions" }, "actor-session");
			assert.ok(!("error" in created));

			const updated = await service.update({ id: created.id, title: "Tracked actions" }, "actor-session");
			assert.ok(!("error" in updated));
			const updateEvent = events.at(-1);
			assertTaskChanged(updateEvent);
			assert.equal(updateEvent.action, "updated");

			const stale = await service.update({ id: created.id, title: "Stale", expectedRevision: 1 }, "actor-session");
			assert.ok("error" in stale);
			assert.equal(events.length, 2);

			const blocked = await service.block(created.id, "Waiting on review", updated.revision, "actor-session");
			assert.ok(!("error" in blocked));
			const blockEvent = events.at(-1);
			assertTaskChanged(blockEvent);
			assert.equal(blockEvent.action, "blocked");

			const deleted = await service.softDelete(created.id, blocked.revision, "actor-session");
			assert.ok(!("error" in deleted));
			const deleteEvent = events.at(-1);
			assertTaskChanged(deleteEvent);
			assert.equal(deleteEvent.action, "deleted");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
