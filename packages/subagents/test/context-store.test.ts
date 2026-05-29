import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SubAgentContextStore } from "../src/context-store.js";

describe("SubAgentContextStore", () => {
	it("records and formats durable subagent context", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "subagent-context-"));
		try {
			const store = new SubAgentContextStore(cwd);
			await store.record({
				sessionId: "session-1",
				taskId: "task-1",
				definitionName: "analyzer",
				entry: {
					kind: "decision",
					summary: "Use the shared config manager",
					details: "It keeps session-factory small.",
					files: ["packages/subagents/src/config-manager.ts"],
					decisions: ["Project overrides win over built-in defaults"],
				},
			});

			const doc = await store.read("session-1", "task-1");
			expect(doc?.entries).toHaveLength(1);
			expect(doc?.entries[0].summary).toBe("Use the shared config manager");
			expect(store.getPath("session-1", "task-1")).toContain(".pi/subagents/context/session-1/task-1.json");

			const formatted = await store.formatForPrompt("session-1", "task-1");
			expect(formatted).toContain("decision: Use the shared config manager");
			expect(formatted).toContain("packages/subagents/src/config-manager.ts");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("returns an empty message when no context exists", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "subagent-context-"));
		try {
			const store = new SubAgentContextStore(cwd);
			await expect(store.read("session-1", "missing")).resolves.toBeNull();
			await expect(store.formatForPrompt("session-1", "missing")).resolves.toBe(
				"No durable subagent context has been recorded.",
			);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
