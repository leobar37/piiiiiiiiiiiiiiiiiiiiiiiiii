import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsArtifactStore } from "../src/fs-artifact-store.js";
import type { DelegationResult, SubAgentEvent } from "../src/types.js";

describe("FsArtifactStore", () => {
	let tmpDir: string;
	let store: FsArtifactStore;

	const sampleResult: DelegationResult = {
		taskId: "task-1",
		agent: "analyzer",
		status: "completed",
		summary: "Analysis complete. Found 3 issues.",
		structuredResult: true,
		duration: 1500,
		turnCount: 5,
		finalState: {
			instanceId: "inst-1",
			taskId: "task-1",
			definitionName: "analyzer",
			cwd: "/tmp/test",
			state: "completed",
			startTime: 1000,
			endTime: 2500,
			turnCount: 5,
			lastActivityAt: 2500,
			currentTool: null,
			error: null,
			toolCount: 10,
			currentToolStartedAt: null,
			durationMs: 1500,
		},
	};

	const sampleEvents: SubAgentEvent[] = [
		{
			type: "instance.created",
			instanceId: "inst-1",
			taskId: "task-1",
			definitionName: "analyzer",
			timestamp: 1000,
		},
		{
			type: "task.start",
			instanceId: "inst-1",
			taskId: "task-1",
			definitionName: "analyzer",
			timestamp: 1100,
		},
	];

	beforeEach(() => {
		tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "pi-fs-store-test-")));
		store = new FsArtifactStore(tmpDir);
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("constructor creates directory", async () => {
		rmSync(tmpDir, { recursive: true, force: true });

		expect(existsSync(tmpDir)).toBe(false);
		store = new FsArtifactStore(tmpDir);
		expect(existsSync(tmpDir)).toBe(true);
	});

	it("saveResult writes .result.md with correct format", async () => {
		await store.saveResult("task-1", sampleResult);
		const path = join(tmpDir, "task-1.result.md");
		expect(existsSync(path)).toBe(true);

		const content = readFileSync(path, "utf-8");
		expect(content).toContain("# Result: task-1");
		expect(content).toContain("completed");
		expect(content).toContain("1500ms");
		expect(content).toContain("Analysis complete. Found 3 issues.");
	});

	it("saveEventLog writes .events.jsonl NDJSON", async () => {
		await store.saveEventLog("task-1", sampleEvents);
		const path = join(tmpDir, "task-1.events.jsonl");
		expect(existsSync(path)).toBe(true);

		const content = readFileSync(path, "utf-8").trim();
		const lines = content.split("\n");
		expect(lines).toHaveLength(2);

		const parsed = JSON.parse(lines[0]);
		expect(parsed.type).toBe("instance.created");
		expect(parsed.taskId).toBe("task-1");
	});

	it("readResult returns null for unknown taskId", async () => {
		const result = await store.readResult("nonexistent");
		expect(result).toBeNull();
	});

	it("readResult returns content for known taskId", async () => {
		await store.saveResult("task-1", sampleResult);
		const content = await store.readResult("task-1");
		expect(content).not.toBeNull();
		expect(content!).toContain("# Result: task-1");
		expect(content!).toContain("completed");
	});

	it("handles multiple tasks without collisions", async () => {
		const result2: DelegationResult = {
			...sampleResult,
			taskId: "task-2",
			summary: "Second task done",
		};

		await store.saveResult("task-1", sampleResult);
		await store.saveResult("task-2", result2);

		const content1 = await store.readResult("task-1");
		const content2 = await store.readResult("task-2");

		expect(content1).toContain("Analysis complete");
		expect(content2).toContain("Second task done");
	});

	it("handles empty events list", async () => {
		await store.saveEventLog("task-empty", []);
		const path = join(tmpDir, "task-empty.events.jsonl");
		expect(existsSync(path)).toBe(true);
		const content = readFileSync(path, "utf-8").trim();
		expect(content).toBe("");
	});

	it("handles failed result correctly", async () => {
		const failedResult: DelegationResult = {
			taskId: "task-fail",
			agent: "analyzer",
			status: "failed",
			summary: "Failed",
			structuredResult: false,
			duration: 500,
			turnCount: 1,
			error: "Something went wrong",
			finalState: {} as any,
		};

		await store.saveResult("task-fail", failedResult);
		const content = await store.readResult("task-fail");
		expect(content).toContain("failed");
	});
});
