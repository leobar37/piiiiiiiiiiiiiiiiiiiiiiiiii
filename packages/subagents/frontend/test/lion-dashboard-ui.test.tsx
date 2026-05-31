import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentRunSidebar } from "../src/components/AgentRunSidebar.js";
import { LionModeBadge } from "../src/components/LionModeBadge.js";
import { groupSubagents, SubagentListPanel } from "../src/components/SubagentListPanel.js";
import type { LionDashboardState, SubAgentInstanceState, SubAgentRunRecord } from "../src/types.js";

const baseAgent: SubAgentInstanceState = {
	instanceId: "subagent-1",
	taskId: "task-1",
	definitionName: "executor",
	kind: "subagent",
	state: "completed",
	startTime: 100,
	endTime: 200,
	turnCount: 1,
	lastActivityAt: 200,
	currentTool: null,
	error: null,
	toolCount: 2,
	currentToolStartedAt: null,
	durationMs: 100,
	modelProvider: "openai-codex",
	modelId: "gpt-5.5",
};

const mainAgent: SubAgentInstanceState = {
	...baseAgent,
	instanceId: "main:session-1",
	taskId: "main",
	definitionName: "main-agent",
	kind: "main",
	description: "Primary session",
	sessionId: "session-1",
};

const runningAgent: SubAgentInstanceState = {
	...baseAgent,
	instanceId: "subagent-running",
	taskId: "task-running",
	definitionName: "executor",
	kind: "subagent",
	description: "Running executor",
	state: "running",
	runId: "run-a",
	runIndex: 0,
	currentTool: "edit",
	lastActivityAt: 300,
};

const failedAgent: SubAgentInstanceState = {
	...baseAgent,
	instanceId: "subagent-failed",
	taskId: "task-failed",
	definitionName: "reviewer",
	kind: "subagent",
	description: "Failed reviewer",
	state: "failed",
	runId: "run-a",
	runIndex: 1,
	error: "Timed out",
	lastActivityAt: 250,
};

const completedAgent: SubAgentInstanceState = {
	...baseAgent,
	instanceId: "subagent-completed",
	taskId: "task-completed",
	definitionName: "analyzer",
	kind: "subagent",
	description: "Completed analyzer",
	state: "completed",
	runId: "run-b",
	runIndex: 0,
	lastActivityAt: 200,
};

const baseRun: SubAgentRunRecord = {
	version: 1,
	sessionId: "session-1",
	taskId: "task-1",
	instanceId: "subagent-1",
	definitionName: "executor",
	cwd: "/tmp/project",
	description: "Executor task",
	prompt: "Implement the requested change.",
	systemPrompt: "Executor system prompt.",
	modelProvider: "openai-codex",
	modelId: "gpt-5.5",
	status: "completed",
	summary: "Implementation complete.",
	startedAt: 100,
	updatedAt: 200,
	completedAt: 200,
	turnCount: 1,
	toolCount: 2,
};

function createLionState(overrides: Partial<LionDashboardState>): LionDashboardState {
	return {
		active: true,
		strategy: "plan",
		phase: "planning",
		activePlanPath: ".plans/dashboard",
		activePlanSlug: "dashboard",
		planKind: "structured",
		activeTaskId: null,
		lastRunId: "run-1",
		...overrides,
	};
}

describe("Lion dashboard UI", () => {
	it("hides run input and output for the main session", () => {
		const html = renderToString(
			<AgentRunSidebar
				agent={{
					...baseAgent,
					instanceId: "main:session-1",
					taskId: "main",
					definitionName: "main-agent",
					kind: "main",
					sessionId: "session-1",
				}}
				run={baseRun}
			/>,
		);

		expect(html).not.toContain("Input");
		expect(html).not.toContain("Output");
		expect(html).not.toContain("System Prompt");
		expect(html).toContain("Session");
		expect(html).toContain("session-1");
	});

	it("shows run input and output for subagents", () => {
		const html = renderToString(<AgentRunSidebar agent={baseAgent} run={baseRun} />);

		expect(html).toContain("Input");
		expect(html).toContain("Implement the requested change.");
		expect(html).toContain("System Prompt");
		expect(html).toContain("Executor system prompt.");
		expect(html).toContain("Output");
		expect(html).toContain("Implementation complete.");
	});

	it("formats simple mode state", () => {
		const html = renderToString(<LionModeBadge state={createLionState({ strategy: "simple", phase: "building" })} />);

		expect(html).toContain("Simple mode");
		expect(html).toContain("Building");
	});

	it("formats plan mode state with the active plan", () => {
		const html = renderToString(<LionModeBadge state={createLionState({ activePlanSlug: "dashboard-plan" })} />);

		expect(html).toContain("Plan mode");
		expect(html).toContain("Planning");
		expect(html).toContain("dashboard-plan");
	});

	it("renders only subagents in the persistent list", () => {
		const html = renderToString(
			<SubagentListPanel activeThreadId={null} agentsOverride={[mainAgent, runningAgent, completedAgent]} />,
		);

		expect(html).toContain("Running executor");
		expect(html).toContain("Completed analyzer");
		expect(html).not.toContain("Primary session");
	});

	it("marks the active subagent in the persistent list", () => {
		const html = renderToString(
			<SubagentListPanel activeThreadId="subagent-running" agentsOverride={[runningAgent, completedAgent]} />,
		);

		expect(html).toContain('aria-current="page"');
		expect(html).toContain("Running executor");
	});

	it("groups subagents by run id", () => {
		const groups = groupSubagents([mainAgent, runningAgent, failedAgent, completedAgent], "all");

		expect(groups).toHaveLength(2);
		expect(groups[0]?.runId).toBe("run-a");
		expect(groups[0]?.threads.map((thread) => thread.instanceId)).toEqual(["subagent-running", "subagent-failed"]);
		expect(groups[1]?.runId).toBe("run-b");
	});

	it("filters subagents by status", () => {
		const agents = [mainAgent, runningAgent, failedAgent, completedAgent];

		expect(groupSubagents(agents, "running").flatMap((group) => group.threads.map((thread) => thread.instanceId))).toEqual([
			"subagent-running",
		]);
		expect(groupSubagents(agents, "failed").flatMap((group) => group.threads.map((thread) => thread.instanceId))).toEqual([
			"subagent-failed",
		]);
		expect(groupSubagents(agents, "completed").flatMap((group) => group.threads.map((thread) => thread.instanceId))).toEqual([
			"subagent-completed",
		]);
	});
});
