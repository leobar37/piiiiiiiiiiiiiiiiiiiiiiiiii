import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentRunSidebar } from "../src/components/AgentRunSidebar";
import { ChatComposer } from "../src/components/ChatComposer";
import { LionModeBadge } from "../src/components/LionModeBadge";
import { MessageItem } from "../src/components/MessageItem";
import { groupSubagents, SubagentListPanel } from "../src/components/SubagentListPanel";
import { TaskSidebarSection } from "../src/components/TaskSidebarSection";
import { useSubAgentStore } from "../src/store/use-subagent-store";
import type { ChatMessage, LionDashboardState, SubAgentInstanceState, SubAgentRunRecord, TaskRecord } from "../src/types";

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

const sidebarTasks: TaskRecord[] = [
	{
		id: "deadbeef",
		title: "Wire task sidebar",
		status: "in_progress",
		createdAt: "2026-06-12T00:00:00.000Z",
		updatedAt: "2026-06-12T00:00:00.000Z",
		revision: 1,
		assignedToSession: "session-1",
		context: { notes: "Keep context compact." },
	},
	{
		id: "feedface",
		title: "Review task store",
		status: "pending",
		createdAt: "2026-06-12T00:00:00.000Z",
		updatedAt: "2026-06-12T00:00:00.000Z",
		revision: 1,
	},
];

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

function renderWithQueryClient(element: React.ReactElement): string {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});
	return renderToString(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}

describe("Lion dashboard UI", () => {
	it("hides run input and output for the main session", () => {
		const html = renderWithQueryClient(
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
		expect(html).not.toContain("session-1");
		expect(html).not.toContain("Status");
		expect(html).not.toContain("paused");
	});

	it("renders task groups in the main session sidebar", () => {
		const html = renderWithQueryClient(<TaskSidebarSection sessionId="session-1" tasksOverride={sidebarTasks} />);

		expect(html).toContain("Tasks");
		expect(html).toContain("Active");
		expect(html).toContain("Pending");
		expect(html).toContain("Wire task sidebar");
		expect(html).toContain("Keep context compact.");
		expect(html).toContain("Review task store");
	});

	it("shows run input and output for subagents", () => {
		const html = renderWithQueryClient(<AgentRunSidebar agent={baseAgent} run={baseRun} />);

		expect(html).toContain("Input");
		expect(html).toContain("Implement the requested change.");
		expect(html).toContain("System Prompt");
		expect(html).toContain("Executor system prompt.");
		expect(html).toContain("Output");
		expect(html).toContain("Implementation complete.");
	});

	it("formats simple mode state", () => {
		const html = renderToString(<LionModeBadge state={createLionState({ strategy: "simple", phase: "building" })} />);

		expect(html).toContain("Simple");
		expect(html).toContain("Building");
	});

	it("hides badge when strategy is none", () => {
		const html = renderToString(<LionModeBadge state={createLionState({ strategy: "none", active: true })} />);

		expect(html).not.toContain("Lion");
		expect(html).not.toContain("Normal");
	});

	it("formats plan mode state with the active plan", () => {
		const html = renderToString(<LionModeBadge state={createLionState({ activePlanSlug: "dashboard-plan" })} />);

		expect(html).toContain("Plan");
		expect(html).toContain("Planning");
		expect(html).toContain("dashboard-plan");
	});

	it("hides Lion mode state when Lion is inactive", () => {
		const html = renderToString(<LionModeBadge state={createLionState({ active: false })} />);

		expect(html).not.toContain("Plan");
		expect(html).not.toContain("Lion inactive");
	});

	it("hides plan mode state without an active Lion plan or run", () => {
		const html = renderToString(
			<LionModeBadge
				state={createLionState({
					active: true,
					activePlanPath: null,
					activePlanSlug: null,
					activeTaskId: null,
					lastRunId: null,
				})}
			/>,
		);

		expect(html).not.toContain("Plan");
	});

	it("renders only subagents in the persistent list", () => {
		const html = renderToString(
			<SubagentListPanel activeThreadId={null} agentsOverride={[mainAgent, runningAgent, completedAgent]} initiallyOpen />,
		);

		expect(html).toContain("Running executor");
		expect(html).toContain("Completed analyzer");
		expect(html).not.toContain("Primary session");
	});

	it("keeps the subagent trigger in the layout rail", () => {
		const html = renderToString(<SubagentListPanel activeThreadId={null} agentsOverride={[runningAgent]} />);

		expect(html).toContain("relative z-30 flex h-full w-11");
		expect(html).toContain("pt-16");
		expect(html).not.toContain("fixed left-4 top-4");
	});

	it("marks the active subagent in the persistent list", () => {
		const html = renderToString(
			<SubagentListPanel activeThreadId="subagent-running" agentsOverride={[runningAgent, completedAgent]} initiallyOpen />,
		);

		expect(html).toContain('aria-current="page"');
		expect(html).toContain("Running executor");
	});

	it("hides the subagent widget when no subagents exist", () => {
		const html = renderToString(<SubagentListPanel activeThreadId="main:session-1" agentsOverride={[mainAgent]} />);

		expect(html).not.toContain("Subagents");
		expect(html).not.toContain("No subagents yet");
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

	it("renders composer mode controls", () => {
		useSubAgentStore.getState().setConnected(true);

		const html = renderWithQueryClient(<ChatComposer instanceId="subagent-running" thread={runningAgent} />);

		expect(html).toContain("Message thread");
		expect(html).toContain("openai-codex/gpt-5.5");
		expect(html).toContain("Prompt");
		expect(html).toContain("Follow-up");
		expect(html).toContain("Steer");
		expect(html).toContain("aria-label=\"Send\"");
	});

	it("renders the main composer when only SSE is disconnected", () => {
		useSubAgentStore.getState().setConnected(false);

		const html = renderWithQueryClient(<ChatComposer instanceId="main:session-1" thread={mainAgent} />);

		expect(html).not.toContain("Disconnected");
		expect(html).toContain("aria-label=\"Send\"");
	});

	it("renders thinking outside the assistant message bubble and hides role labels", () => {
		const message: ChatMessage = {
			id: "assistant-1",
			instanceId: "main:session-1",
			role: "assistant",
			blocks: [
				{ type: "thinking", thinking: "Planning the response." },
				{ type: "text", text: "Hola." },
			],
			timestamp: 100,
		};

		const html = renderToString(<MessageItem message={message} />);

		expect(html).toContain("Thinking");
		expect(html).toContain("Hola.");
		expect(html).not.toContain("ASSISTANT");
		expect(html.indexOf("Thinking")).toBeLessThan(html.indexOf("Hola."));
	});

	it("renders assistant tools grouped outside the text bubble", () => {
		const message: ChatMessage = {
			id: "assistant-tools",
			instanceId: "main:session-1",
			role: "assistant",
			blocks: [
				{ type: "text", text: "Running checks." },
				{ type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "bun run check" } },
				{ type: "toolResult", toolCallId: "tool-1", toolName: "bash", content: "ok", isError: false },
			],
			timestamp: 100,
		};

		const html = renderToString(<MessageItem message={message} />);

		expect(html).toContain("Running checks.");
		expect(html).toContain("bash");
		expect(html).toContain("Result");
		expect(html.indexOf("Running checks.")).toBeLessThan(html.indexOf("bash"));
		expect(html.indexOf("bash")).toBeLessThan(html.indexOf("Result"));
		expect(html).not.toContain("pl-2");
		expect(html).not.toContain("border-success");
	});
});
