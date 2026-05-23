import { describe, expect, it } from "vitest";
import {
	ANALYZER_BUILDER,
	DEFAULT_BUILDER,
	EXECUTOR_BUILDER,
	PLANNER_BUILDER,
	REVIEWER_BUILDER,
} from "../src/instructions/defaults.js";
import { bulletList, minimalChanges, onlyFlagSecurity, withSummary } from "../src/instructions/presets.js";
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

describe("Default instruction builders", () => {
	it("DEFAULT_BUILDER includes name, description, prompt, and summary instruction", () => {
		const output = DEFAULT_BUILDER(makeCtx());
		expect(output).toContain("test-agent");
		expect(output).toContain("A test agent");
		expect(output).toContain("Do the thing");
		expect(output).toContain("When done, provide a concise summary");
	});

	it("EXECUTOR_BUILDER includes test and summary instructions", () => {
		const output = EXECUTOR_BUILDER(makeCtx());
		expect(output).toContain("Make minimal, safe changes");
		expect(output).toContain("Run tests after each edit");
		expect(output).toContain("summarize what you changed");
	});

	it("ANALYZER_BUILDER includes investigation and detail instructions", () => {
		const output = ANALYZER_BUILDER(makeCtx());
		expect(output).toContain("Investigate thoroughly");
		expect(output).toContain("detailed analysis");
		expect(output).toContain("file paths and line numbers");
	});

	it("PLANNER_BUILDER includes actionable plan instructions", () => {
		const output = PLANNER_BUILDER(makeCtx());
		expect(output).toContain("clear, actionable plan");
		expect(output).toContain("ordered steps");
	});

	it("REVIEWER_BUILDER includes bullet list and 'Review complete'", () => {
		const output = REVIEWER_BUILDER(makeCtx());
		expect(output).toContain("Review the work");
		expect(output).toContain("bullet list");
		expect(output).toContain("Review complete");
	});

	it("all builders include the task prompt", () => {
		const builders = [DEFAULT_BUILDER, EXECUTOR_BUILDER, ANALYZER_BUILDER, PLANNER_BUILDER, REVIEWER_BUILDER];
		for (const builder of builders) {
			expect(builder(makeCtx())).toContain("Do the thing");
		}
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

describe("Instruction presets", () => {
	it("withSummary adds summary instruction", () => {
		const output = withSummary(makeCtx());
		expect(output).toContain("Do the thing");
		expect(output).toContain("When done, provide a concise summary");
	});

	it("bulletList adds bullet report instruction", () => {
		const output = bulletList(makeCtx());
		expect(output).toContain("bullet list");
	});

	it("onlyFlagSecurity limits to security issues", () => {
		const output = onlyFlagSecurity(makeCtx());
		expect(output).toContain("Only flag security issues");
		expect(output).toContain("Ignore style, performance, or documentation");
	});

	it("minimalChanges adds minimal + test instructions", () => {
		const output = minimalChanges(makeCtx());
		expect(output).toContain("minimal, focused changes");
		expect(output).toContain("Run tests after each edit");
	});

	it("all presets include the task prompt", () => {
		const presets = [withSummary, bulletList, onlyFlagSecurity, minimalChanges];
		for (const preset of presets) {
			expect(preset(makeCtx())).toContain("Do the thing");
		}
	});
});
