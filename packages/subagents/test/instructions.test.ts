import { describe, expect, it } from "vitest";
import {
	ANALYZER_BUILDER,
	DEFAULT_BUILDER,
	EXECUTOR_BUILDER,
	PLANNER_BUILDER,
	REVIEWER_BUILDER,
} from "../src/instructions/defaults.js";

import type { InstructionContext } from "../src/instructions/types.js";

function makeCtx(overrides: Partial<InstructionContext["task"]> = {}): InstructionContext {
	return {
		task: {
			id: "test-task",
			definition: "test-agent",
			prompt: "Do the thing",
			description: "Test task description",
			...overrides,
		},
		config: {
			name: "test-agent",
			description: "A test agent",
			systemPrompt: "You are a test agent.",
			capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
		},
	};
}

function makeSimpleCtx(): InstructionContext {
	const ctx = makeCtx();
	return {
		...ctx,
		task: {
			...ctx.task,
			orchestration: { strategy: "simple" },
		},
		orchestration: { strategy: "simple" },
	};
}

describe("Default instruction builders", () => {
	it("DEFAULT_BUILDER includes name, description, prompt, and summary instruction", () => {
		const output = DEFAULT_BUILDER(makeCtx());
		expect(output).toContain("test-agent");
		expect(output).toContain("A test agent");
		expect(output).toContain("Do the thing");
		expect(output).toContain("When done, provide a concise summary");
	});

	it("EXECUTOR_BUILDER includes scoped validation and summary instructions", () => {
		const output = EXECUTOR_BUILDER(makeCtx());
		expect(output).toContain("Make minimal, safe changes");
		expect(output).toContain("Validate according to the scope");
		expect(output).toContain("commands permitted by the task and repository");
		expect(output).toContain("Do not claim verification without concrete evidence");
		expect(output).toContain("summarize what you changed");
		expect(output).toContain("Use any relevant loaded skill");
	});

	it("ANALYZER_BUILDER includes investigation and detail instructions", () => {
		const output = ANALYZER_BUILDER(makeCtx());
		expect(output).toContain("Investigate thoroughly");
		expect(output).toContain("concrete report");
		expect(output).toContain("file paths and line numbers");
		expect(output).toContain("recommended next delegation");
	});

	it("PLANNER_BUILDER includes actionable plan instructions", () => {
		const output = PLANNER_BUILDER(makeCtx());
		expect(output).toContain("clear, actionable plan");
		expect(output).toContain("ordered steps");
		expect(output).toContain("boundaries, dependencies, risks, and validation");
	});

	it("REVIEWER_BUILDER includes severity-first findings and 'Review complete'", () => {
		const output = REVIEWER_BUILDER(makeCtx());
		expect(output).toContain("Review the work");
		expect(output).toContain("Report findings first");
		expect(output).toContain("ordered by severity");
		expect(output).toContain("cite the evidence checked");
		expect(output).toContain("Review complete");
	});

	it("all builders include the task prompt", () => {
		const builders = [DEFAULT_BUILDER, EXECUTOR_BUILDER, ANALYZER_BUILDER, PLANNER_BUILDER, REVIEWER_BUILDER];
		for (const builder of builders) {
			expect(builder(makeCtx())).toContain("Do the thing");
		}
	});

	it("all builders frame the task prompt as a delegation brief", () => {
		const builders = [DEFAULT_BUILDER, EXECUTOR_BUILDER, ANALYZER_BUILDER, PLANNER_BUILDER, REVIEWER_BUILDER];
		for (const builder of builders) {
			const output = builder(makeCtx());
			expect(output).toContain("Structured delegation brief:");
			expect(output).toContain("source of truth");
			expect(output).toContain("Read referenced sources before");
			expect(output).toContain("subagent_record_context");
			expect(output).toContain("subagent_record_result");
			expect(output).toContain("Do not ask the user for clarification");
			expect(output).toContain("unknowns");
		}
	});

	it("simple orchestration builders do not assume plan files", () => {
		const builders = [DEFAULT_BUILDER, EXECUTOR_BUILDER, ANALYZER_BUILDER, PLANNER_BUILDER, REVIEWER_BUILDER];
		for (const builder of builders) {
			const output = builder(makeSimpleCtx());
			expect(output).toContain("delegated scope and referenced files");
			expect(output).toContain("Do not assume a durable plan");
			expect(output).not.toContain("Use referenced plan, task, and source files as the source of truth");
		}
	});

	it("ANALYZER_BUILDER is explicitly non-interactive and read-only", () => {
		const output = ANALYZER_BUILDER(makeCtx());
		expect(output).toContain("non-interactive analyzer worker");
		expect(output).toContain("do not wait for external input");
		expect(output).toContain("do not edit files");
		expect(output).toContain("unknowns");
	});

	it("all builders include config name and description", () => {
		const builders = [DEFAULT_BUILDER, EXECUTOR_BUILDER, ANALYZER_BUILDER, PLANNER_BUILDER, REVIEWER_BUILDER];
		for (const builder of builders) {
			const output = builder(makeCtx());
			expect(output).toContain("test-agent");
			expect(output).toContain("A test agent");
		}
	});
});
