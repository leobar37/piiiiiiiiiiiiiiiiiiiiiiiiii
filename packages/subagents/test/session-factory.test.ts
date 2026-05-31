import { describe, expect, it } from "vitest";
import { preserveInternalSubagentTools } from "../src/session-factory.js";

describe("session factory tool allowlist", () => {
	it("preserves internal subagent tools when explicit tools are requested", () => {
		const tools = preserveInternalSubagentTools(
			["read", "glob", "grep"],
			["read", "glob", "grep", "subagent_record_context", "subagent_read_context", "subagent_record_result"],
		);

		expect(tools).toEqual([
			"read",
			"glob",
			"grep",
			"subagent_record_context",
			"subagent_read_context",
			"subagent_record_result",
		]);
	});

	it("does not add internal subagent tools that are not registered", () => {
		const tools = preserveInternalSubagentTools(["read"], ["read", "glob"]);

		expect(tools).toEqual(["read"]);
	});
});
