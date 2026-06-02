import { describe, expect, it } from "vitest";
import { resolveEffectiveConfig } from "../src/config-resolver.js";
import { reviewerDefinition } from "../src/definitions/reviewer.js";
import type { DelegationTask, SubAgentDefinition } from "../src/types.js";

const baseDefinition: SubAgentDefinition = {
	name: "test-agent",
	description: "A test agent",
	systemPrompt: "You are a test agent.",
	capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
	tools: ["read", "glob"],
	disabledTools: ["write"],
	skillPaths: [".codex/skills/core/SKILL.md"],
	model: "gpt-4",
	thinkingLevel: "medium",
	maxTurns: 20,
	timeout: 60000,
	allowQuery: true,
	verboseTools: false,
};

describe("resolveEffectiveConfig", () => {
	it("returns definition values when task has no overrides", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.name).toBe("test-agent");
		expect(config.systemPrompt).toBe("You are a test agent.");
		expect(config.capabilities).toEqual(baseDefinition.capabilities);
		expect(config.tools).toEqual(["read", "glob"]);
		expect(config.model).toBe("gpt-4");
	});

	it("merges description: task overrides definition", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			description: "Custom description",
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.description).toBe("Custom description");
	});

	it("uses definition description when task has none", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.description).toBe("A test agent");
	});

	it("merges systemPrompt in append mode (default)", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			systemPrompt: "Extra instructions.",
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.systemPrompt).toBe("You are a test agent.\n\nExtra instructions.");
	});

	it("merges systemPrompt in replace mode", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			systemPrompt: "Replacement instructions.",
			systemPromptMode: "replace",
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.systemPrompt).toBe("Replacement instructions.");
	});

	it("merges systemPrompt in prepend mode", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			systemPrompt: "Prepended instructions.",
			systemPromptMode: "prepend",
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.systemPrompt).toBe("Prepended instructions.\n\nYou are a test agent.");
	});

	it("keeps base systemPrompt when task has no systemPrompt override", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.systemPrompt).toBe("You are a test agent.");
	});

	it("merges capabilities: task overrides definition fields", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			capabilities: { canEdit: true },
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.capabilities.canEdit).toBe(true);
		expect(config.capabilities.canExecute).toBe(false); // from definition
		expect(config.capabilities.canResearch).toBe(true); // from definition
	});

	it("merges disabledTools: concatenates both arrays", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			disabledTools: ["edit"],
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.disabledTools).toEqual(["write", "edit"]);
	});

	it("merges skillPaths from definition and task without duplicates", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			skillPaths: [".codex/skills/core/SKILL.md", ".codex/skills/frontend/SKILL.md"],
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.skillPaths).toEqual([".codex/skills/core/SKILL.md", ".codex/skills/frontend/SKILL.md"]);
	});

	it("loads the bundled code-review skill automatically for reviewer subagents", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "reviewer",
			prompt: "Review the change",
			skillPaths: [".codex/skills/core/SKILL.md"],
		};

		const config = resolveEffectiveConfig(reviewerDefinition, task);
		expect(config.skillPaths?.some((path) => path.includes("skills/code-review"))).toBe(true);
		expect(config.skillPaths).toContain(".codex/skills/core/SKILL.md");
		expect(config.systemPrompt).toContain("false-positive explanation");
	});

	it("sets tools from task when provided (not union)", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			tools: ["bash"],
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.tools).toEqual(["bash"]);
	});

	it("uses definition tools when task has none", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.tools).toEqual(["read", "glob"]);
	});

	it("merges scalar overrides: task ?? definition", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			model: "claude-3",
			maxTurns: 10,
		};

		const config = resolveEffectiveConfig(baseDefinition, task);
		expect(config.model).toBe("claude-3");
		expect(config.maxTurns).toBe(10);
		expect(config.timeout).toBe(60000); // from definition
	});

	it("uses project agent config between task and definition", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
		};

		const config = resolveEffectiveConfig(baseDefinition, task, {
			agentConfig: {
				model: "deepseek/deepseek-v4-flash",
				fallbackModels: ["kimi-coding/kimi-for-coding"],
				thinkingLevel: "high",
			},
		});

		expect(config.model).toBe("deepseek/deepseek-v4-flash");
		expect(config.fallbackModels).toEqual(["kimi-coding/kimi-for-coding"]);
		expect(config.thinkingLevel).toBe("high");
	});

	it("keeps task model overrides above project agent config", () => {
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			model: "kimi-coding/kimi-for-coding",
			fallbackModels: ["deepseek/deepseek-v4-pro"],
			thinkingLevel: "minimal",
		};

		const config = resolveEffectiveConfig(baseDefinition, task, {
			agentConfig: {
				model: "deepseek/deepseek-v4-flash",
				fallbackModels: ["deepseek/deepseek-v4-pro"],
				thinkingLevel: "high",
			},
		});

		expect(config.model).toBe("kimi-coding/kimi-for-coding");
		expect(config.fallbackModels).toEqual(["deepseek/deepseek-v4-pro"]);
		expect(config.thinkingLevel).toBe("minimal");
	});

	it("passes through instructionBuilder from definition", () => {
		const builder = () => "custom";
		const def = { ...baseDefinition, instructionBuilder: builder };
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
		};

		const config = resolveEffectiveConfig(def, task);
		expect(config.instructionBuilder).toBe(builder);
	});

	it("instructionBuilder from task overrides definition", () => {
		const defBuilder = () => "definition builder";
		const taskBuilder = () => "task builder";
		const def = { ...baseDefinition, instructionBuilder: defBuilder };
		const task: DelegationTask = {
			id: "task-1",
			definition: "test-agent",
			prompt: "Do something",
			instructionBuilder: taskBuilder,
		};

		const config = resolveEffectiveConfig(def, task);
		expect(config.instructionBuilder).toBe(taskBuilder);
	});
});
