import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import { formatTaskId, TaskStore } from "../../src/tasks/store.js";

async function testCreateListAndGet(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "tasks-store-"));
	try {
		const store = new TaskStore(join(cwd, ".pi", "todos"));
		await store.initialize();
		const task = await store.create({
			title: "Extract task store",
			context: {
				why: "Current todo implementation is monolithic.",
				files: ["packages/extensions/src/extensions/todos/index.ts"],
				doneWhen: ["store is tested"],
				notes: "Keep context compact.",
			},
		});
		assert.ok(!("error" in task));
		assert.match(formatTaskId(task.id), /^TASK-[a-f0-9]{8}$/);
		assert.equal(task.status, "pending");
		assert.equal(task.revision, 1);

		const tasks = await store.list();
		assert.equal(tasks.length, 1);
		assert.equal(tasks[0]?.context?.why, "Current todo implementation is monolithic.");

		const fetched = await store.get(task.id);
		assert.equal(fetched?.id, task.id);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testContextLimits(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "tasks-context-"));
	try {
		const store = new TaskStore(join(cwd, ".pi", "todos"));
		await store.initialize();
		const result = await store.create({
			title: "Too much context",
			context: {
				files: Array.from({ length: 13 }, (_, index) => `file-${index}.ts`),
			},
		});
		assert.ok("error" in result);
		assert.equal(result.error.code, "invalid_context");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testSingleActiveTaskPerSession(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "tasks-active-"));
	try {
		const store = new TaskStore(join(cwd, ".pi", "todos"));
		await store.initialize();
		const first = await store.create(
			{ title: "First", status: "in_progress", assignedToSession: "session-1" },
			"session-1",
		);
		assert.ok(!("error" in first));
		const second = await store.create(
			{ title: "Second", status: "in_progress", assignedToSession: "session-1" },
			"session-1",
		);
		assert.ok("error" in second);
		assert.equal(second.error.code, "active_task_conflict");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testRevisionAndSoftDelete(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "tasks-revision-"));
	try {
		const store = new TaskStore(join(cwd, ".pi", "todos"));
		await store.initialize();
		const created = await store.create({ title: "Patch me" }, "session-1");
		assert.ok(!("error" in created));
		const updated = await store.update({ id: created.id, title: "Patched", expectedRevision: 1 }, "session-1");
		assert.ok(!("error" in updated));
		assert.equal(updated.revision, 2);
		const conflict = await store.update({ id: created.id, title: "Stale", expectedRevision: 1 }, "session-1");
		assert.ok("error" in conflict);
		assert.equal(conflict.error.code, "revision_conflict");

		const deleted = await store.softDelete(created.id, undefined, "session-1");
		assert.ok(!("error" in deleted));
		assert.equal((await store.list()).length, 0);
		assert.equal((await store.list({ includeDeleted: true })).length, 1);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testSnapshotRebuild(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "tasks-rebuild-"));
	try {
		const todosDir = join(cwd, ".pi", "todos");
		const store = new TaskStore(todosDir);
		await store.initialize();
		const task = await store.create({ title: "Replay me" }, "session-1");
		assert.ok(!("error" in task));
		rmSync(join(todosDir, "snapshot.json"), { force: true });
		const rebuilt = await store.rebuildSnapshot();
		assert.equal(rebuilt.tasks.length, 1);
		assert.equal(rebuilt.tasks[0]?.title, "Replay me");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testLegacyMarkdownMigration(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "tasks-migration-"));
	try {
		const todosDir = join(cwd, ".pi", "todos");
		await mkdir(todosDir, { recursive: true });
		writeFileSync(
			join(todosDir, "deadbeef.md"),
			`${JSON.stringify(
				{
					id: "deadbeef",
					title: "Legacy todo",
					tags: ["migration"],
					status: "open",
					created_at: "2026-01-01T00:00:00.000Z",
					assigned_to_session: "session-1",
				},
				null,
				2,
			)}\n\nLegacy body\n`,
		);
		const store = new TaskStore(todosDir);
		await store.initialize();
		const tasks = await store.list();
		assert.equal(tasks.length, 1);
		assert.equal(tasks[0]?.id, "deadbeef");
		assert.equal(tasks[0]?.context?.notes, "Legacy body\n\nTags: migration");
		assert.match(readFileSync(join(todosDir, "events.jsonl"), "utf8"), /task.created/);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

describe("TaskStore", () => {
	it("creates, lists, and gets tasks", testCreateListAndGet);
	it("enforces compact context limits", testContextLimits);
	it("allows one active task per session", testSingleActiveTaskPerSession);
	it("checks revisions and soft-deletes tasks", testRevisionAndSoftDelete);
	it("rebuilds snapshots from events", testSnapshotRebuild);
	it("migrates legacy markdown tasks", testLegacyMarkdownMigration);
});
