import { describe, expect, it, vi } from "vitest";

// =====================================================================
// Mocks — all functions must be inline since vi.mock is hoisted
// =====================================================================

vi.mock("../src/workspace/index.js", () => ({
	SubAgentWorkspace: vi.fn().mockImplementation(() => ({
		prepare: vi.fn().mockResolvedValue({
			cwd: "/fake/cwd",
			isolated: false,
			cleanup: vi.fn().mockResolvedValue(undefined),
		}),
	})),
}));

vi.mock("../src/session-factory.js", () => {
	const listeners = new Set<(...args: any[]) => void>();
	const control = {
		emit(event: any) {
			for (const listener of listeners) listener(event);
		},
	};

	const session = {
		subscribe: vi.fn((fn: any) => {
			listeners.add(fn);
			return () => listeners.delete(fn);
		}) as any,
		sendUserMessage: vi.fn().mockImplementation(async () => {
			control.emit({ type: "agent_start" });
			control.emit({ type: "turn_end", toolResults: [] });
			control.emit({
				type: "message_end",
				message: { role: "assistant", content: "Done" },
			});
			control.emit({ type: "agent_end" });
		}),
		steer: vi.fn().mockResolvedValue(undefined),
		abort: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
		model: null,
		thinkingLevel: "medium",
		isStreaming: false,
		isCompacting: false,
		steeringMode: "all",
		followUpMode: "all",
		sessionFile: undefined,
		sessionId: "fake-session",
		sessionName: undefined,
		autoCompactionEnabled: false,
		messages: [],
		pendingMessageCount: 0,
		modelRegistry: undefined,
		sessionManager: { getBranch: vi.fn().mockReturnValue([]) },
		setModel: vi.fn(),
		cycleModel: vi.fn(),
		setThinkingLevel: vi.fn(),
		cycleThinkingLevel: vi.fn(),
		setSteeringMode: vi.fn(),
		setFollowUpMode: vi.fn(),
		setAutoCompactionEnabled: vi.fn(),
		setAutoRetryEnabled: vi.fn(),
		abortRetry: vi.fn(),
		abortBash: vi.fn(),
		getSessionStats: vi.fn().mockReturnValue({}),
		exportToHtml: vi.fn().mockResolvedValue(""),
		getLastAssistantText: vi.fn().mockReturnValue("Completed summary"),
		prompt: vi.fn(),
		followUp: vi.fn(),
		clearQueue: vi.fn().mockReturnValue({ steering: [], followUp: [] }),
		getActiveToolNames: vi.fn().mockReturnValue([]),
		getAllTools: vi.fn().mockReturnValue([]),
		setActiveToolsByName: vi.fn(),
		executeBash: vi.fn().mockResolvedValue({ output: "", exitCode: 0 }),
		compact: vi.fn().mockResolvedValue({}),
	};

	return {
		createSubAgentSession: vi.fn().mockResolvedValue({ session }),
	};
});

// =====================================================================
// Imports
// =====================================================================

import { SubAgentController } from "../src/controller.js";
import type { SubAgentDefinition } from "../src/types.js";

const sampleDef: SubAgentDefinition = {
	name: "test-agent",
	description: "A test agent",
	systemPrompt: "You are a test agent.",
	capabilities: { canEdit: false, canExecute: false, canWrite: false, canResearch: true },
	tools: ["read", "glob"],
	thinkingLevel: "low",
	allowQuery: true,
	verboseTools: false,
};

function createController(defs: SubAgentDefinition[] = [sampleDef]): SubAgentController {
	return new SubAgentController({
		definitions: defs,
		cwd: "/fake/root",
	});
}

describe("SubAgentController", () => {
	describe("definition management", () => {
		it("registerDefinition adds definition", () => {
			const controller = createController([]);
			controller.registerDefinition(sampleDef);
			expect(controller.getDefinition("test-agent")).toEqual(sampleDef);
		});

		it("registerDefinition throws on duplicate", () => {
			const controller = createController();
			expect(() => controller.registerDefinition(sampleDef)).toThrow(
				'Sub-agent definition "test-agent" already registered',
			);
		});

		it("unregisterDefinition removes definition", () => {
			const controller = createController();
			controller.unregisterDefinition("test-agent");
			expect(controller.getDefinition("test-agent")).toBeUndefined();
		});

		it("unregisterDefinition throws if not found", () => {
			const controller = createController([]);
			expect(() => controller.unregisterDefinition("nonexistent")).toThrow(
				'Sub-agent definition "nonexistent" not found',
			);
		});

		it("getDefinition returns definition by name", () => {
			const controller = createController();
			expect(controller.getDefinition("test-agent")).toBeDefined();
			expect(controller.getDefinition("test-agent")!.name).toBe("test-agent");
		});

		it("getDefinition returns undefined for unknown name", () => {
			const controller = createController();
			expect(controller.getDefinition("unknown")).toBeUndefined();
		});

		it("getDefinitions returns all definitions", () => {
			const def2: SubAgentDefinition = {
				name: "agent-2",
				description: "Second agent",
				systemPrompt: "You are second.",
				capabilities: { canEdit: true, canExecute: false, canWrite: false, canResearch: false },
			};
			const controller = createController([sampleDef, def2]);
			const defs = controller.getDefinitions();
			expect(defs).toHaveLength(2);
			expect(defs.map((d) => d.name)).toEqual(["test-agent", "agent-2"]);
		});
	});

	describe("createInstance", () => {
		it("creates instance from known definition", () => {
			const controller = createController();
			const instance = controller.createInstance({
				id: "task-1",
				definition: "test-agent",
				prompt: "Do something",
			});
			expect(instance.taskId).toBe("task-1");
			expect(instance.definitionName).toBe("test-agent");
		});

		it("throws for unknown definition", () => {
			const controller = createController();
			expect(() =>
				controller.createInstance({
					id: "task-1",
					definition: "unknown",
					prompt: "Do something",
				}),
			).toThrow('Sub-agent definition "unknown" not found');
		});

		it("assigns unique instanceId", () => {
			const controller = createController();
			const i1 = controller.createInstance({ id: "t1", definition: "test-agent", prompt: "a" });
			const i2 = controller.createInstance({ id: "t2", definition: "test-agent", prompt: "b" });
			expect(i1.instanceId).not.toBe(i2.instanceId);
		});
	});

	describe("executeTask", () => {
		it("creates instance, starts it, and returns result", async () => {
			const controller = createController();
			const result = await controller.executeTask({
				id: "task-1",
				definition: "test-agent",
				prompt: "Do something",
			});
			expect(result.taskId).toBe("task-1");
			expect(result.status).toBe("completed");
		});

		it("rejects for unknown definition", async () => {
			const controller = createController();
			await expect(
				controller.executeTask({
					id: "task-1",
					definition: "unknown",
					prompt: "Do something",
				}),
			).rejects.toThrow('Sub-agent definition "unknown" not found');
		});
	});

	describe("executePlan", () => {
		it("validates all definitions before starting", async () => {
			const controller = createController();
			await expect(
				controller.executePlan({
					strategy: "sequential",
					tasks: [
						{ id: "t1", definition: "unknown", prompt: "a" },
						{ id: "t2", definition: "test-agent", prompt: "b" },
					],
				}),
			).rejects.toThrow('Sub-agent definition "unknown" not found');
		});

		it("executes sequential strategy", async () => {
			const controller = createController();
			const results = await controller.executePlan({
				strategy: "sequential",
				tasks: [
					{ id: "t1", definition: "test-agent", prompt: "First" },
					{ id: "t2", definition: "test-agent", prompt: "Second" },
				],
			});
			expect(results).toHaveLength(2);
			expect(results[0].taskId).toBe("t1");
			expect(results[1].taskId).toBe("t2");
		});

		it("executes parallel strategy", async () => {
			const controller = createController();
			const results = await controller.executePlan({
				strategy: "parallel",
				tasks: [
					{ id: "t1", definition: "test-agent", prompt: "First" },
					{ id: "t2", definition: "test-agent", prompt: "Second" },
				],
			});
			expect(results).toHaveLength(2);
		});

		it("executes chain strategy", async () => {
			const controller = createController();
			const results = await controller.executePlan({
				strategy: "chain",
				tasks: [
					{ id: "t1", definition: "test-agent", prompt: "First" },
					{ id: "t2", definition: "test-agent", prompt: "Second" },
				],
			});
			expect(results).toHaveLength(2);
		});
	});

	describe("instance control", () => {
		it("throws for unknown taskId on pause", async () => {
			const controller = createController();
			await expect(controller.pauseInstance("unknown")).rejects.toThrow('Instance "unknown" not found');
		});

		it("throws for unknown taskId on resume", async () => {
			const controller = createController();
			await expect(controller.resumeInstance("unknown")).rejects.toThrow('Instance "unknown" not found');
		});

		it("throws for unknown taskId on cancel", async () => {
			const controller = createController();
			await expect(controller.cancelInstance("unknown")).rejects.toThrow('Instance "unknown" not found');
		});
	});

	describe("query + summarize", () => {
		it("queryInstance returns failed response for unknown id", async () => {
			const controller = createController();
			const response = await controller.queryInstance("unknown", {
				queryId: "q-1",
				question: "What?",
			});
			expect(response.failed).toBe(true);
		});

		it("summarizeInstance returns null for unknown id", async () => {
			const controller = createController();
			const summary = await controller.summarizeInstance("unknown");
			expect(summary).toBeNull();
		});
	});

	describe("instance access", () => {
		it("getInstance returns undefined for unknown task", () => {
			const controller = createController();
			expect(controller.getInstance("unknown")).toBeUndefined();
		});

		it("getInstances returns empty array when no instances", () => {
			const controller = createController();
			expect(controller.getInstances()).toEqual([]);
		});
	});

	describe("RPC proxy methods", () => {
		it("all proxy methods throw for unknown taskId", async () => {
			const controller = createController();
			await expect(controller.promptInstance("unknown", "hi")).rejects.toThrow('Instance "unknown" not found');
			await expect(controller.steerInstance("unknown", "hi")).rejects.toThrow('Instance "unknown" not found');
			await expect(controller.abortInstance("unknown")).rejects.toThrow('Instance "unknown" not found');
		});

		it("getInstanceState throws for unknown taskId", () => {
			const controller = createController();
			expect(() => controller.getInstanceState("unknown")).toThrow('Instance "unknown" not found');
		});
	});

	describe("event bus", () => {
		it("returns event bus", () => {
			const controller = createController();
			const bus = controller.getEventBus();
			expect(bus).toBeDefined();
			expect(bus.on).toBeDefined();
		});

		it("onEvent callback is called", () => {
			const handler = vi.fn();
			const controller = new SubAgentController({
				definitions: [sampleDef],
				cwd: "/fake",
				onEvent: handler,
			});
			// Emit an event to verify the handler is connected
			controller.getEventBus().emit({
				type: "lifecycle.change",
				instanceId: "test",
				previous: "created",
				current: "running",
				timestamp: Date.now(),
			});
			expect(handler).toHaveBeenCalled();
		});
	});

	describe("dispose", () => {
		it("can dispose without instances", async () => {
			const controller = createController();
			await expect(controller.dispose()).resolves.toBeUndefined();
		});

		it("can dispose with instances", async () => {
			const controller = createController();
			await controller.executeTask({
				id: "task-1",
				definition: "test-agent",
				prompt: "Do something",
			});
			await expect(controller.dispose()).resolves.toBeUndefined();
		});

		it("is idempotent", async () => {
			const controller = createController();
			await controller.dispose();
			await expect(controller.dispose()).resolves.toBeUndefined();
		});
	});
});
