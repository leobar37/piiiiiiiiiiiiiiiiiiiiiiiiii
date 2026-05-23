import { describe, expect, it } from "vitest";
import { resolveEffectiveConfig } from "../src/config-resolver.js";
import type { DelegationTask, SubAgentDefinition } from "../src/types.js";

const baseDefinition: SubAgentDefinition = {
	name: "test-agent",
	description: "A test agent",
	systemPrompt: "You are a test agent.",
	capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
	tools: ["read", "glob"],
	disabledTools: ["write"],
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
