import type { SubAgentEvent } from "../types.ts";

const PROGRESS_MESSAGES = [
	"Analyzing the current codebase structure...",
	"Found 3 files that need updating.",
	"Applying changes to src/auth/login.ts",
	"Running tests to verify the implementation...",
	"All tests passed. Moving to next task.",
	"Reviewing the changes made so far...",
	"Detected a potential issue in the error handling.",
	"Fixing the edge case in password validation.",
	"Writing documentation for the new API.",
	"Compacting conversation context...",
];

const TOOL_NAMES = ["read", "edit", "write", "bash", "glob", "search"];

let eventIdCounter = 0;

function nextEventId(): string {
	return `mock-event-${++eventIdCounter}`;
}

function pickRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

export interface LiveAgent {
	instanceId: string;
	taskId: string;
	definitionName: string;
	state: "running" | "completed" | "failed";
	turnCount: number;
	toolCount: number;
	currentTool: string | null;
}

export const LIVE_AGENTS: LiveAgent[] = [
	{
		instanceId: "subagent-task-1-abc123",
		taskId: "task-1",
		definitionName: "executor",
		state: "running",
		turnCount: 3,
		toolCount: 4,
		currentTool: null,
	},
];

export function createMockSseStream(instanceId?: string): ReadableStream<string> {
	const targetAgents = instanceId
		? LIVE_AGENTS.filter((a) => a.instanceId === instanceId)
		: LIVE_AGENTS;

	return new ReadableStream<string>({
		start(controller) {
			let cancelled = false;

			// Emit a ping every 15s to keep connection alive
			const pingInterval = setInterval(() => {
				if (cancelled) return;
				controller.enqueue(`data: ${JSON.stringify({ type: "ping", timestamp: Date.now() })}\n\n`);
			}, 15000);

			// Emit simulated events every 2-5 seconds
			const emitEvent = () => {
				if (cancelled || targetAgents.length === 0) return;

				const agent = pickRandom(targetAgents);
				if (agent.state !== "running") return;

				const event = generateNextEvent(agent);
				const payload = `data: ${JSON.stringify(event)}\n\n`;
				try {
					controller.enqueue(payload);
				} catch {
					cancelled = true;
					clearInterval(pingInterval);
					return;
				}

				const delay = 2000 + Math.random() * 3000;
				setTimeout(emitEvent, delay);
			};

			// Start emitting after a short delay
			setTimeout(emitEvent, 1500);

			// Cleanup
			return () => {
				cancelled = true;
				clearInterval(pingInterval);
			};
		},
	});
}

export function generateNextEvent(agent: LiveAgent): SubAgentEvent {
	const now = Date.now();
	const r = Math.random();

	if (r < 0.3) {
		// Tool start
		const toolName = pickRandom(TOOL_NAMES);
		agent.currentTool = toolName;
		agent.toolCount++;
		return {
			type: "tool.start",
			instanceId: agent.instanceId,
			taskId: agent.taskId,
			toolName,
			toolCallId: nextEventId(),
			timestamp: now,
		};
	}

	if (r < 0.55 && agent.currentTool) {
		// Tool end
		const toolName = agent.currentTool;
		agent.currentTool = null;
		return {
			type: "tool.end",
			instanceId: agent.instanceId,
			taskId: agent.taskId,
			toolName,
			toolCallId: nextEventId(),
			isError: Math.random() < 0.1,
			timestamp: now,
		};
	}

	if (r < 0.75) {
		// Progress update
		return {
			type: "progress.update",
			instanceId: agent.instanceId,
			taskId: agent.taskId,
			message: pickRandom(PROGRESS_MESSAGES),
			timestamp: now,
		};
	}

	if (r < 0.9) {
		// Turn complete
		agent.turnCount++;
		return {
			type: "turn.complete",
			instanceId: agent.instanceId,
			taskId: agent.taskId,
			turnIndex: agent.turnCount - 1,
			toolCount: Math.floor(Math.random() * 3) + 1,
			hadError: false,
			timestamp: now,
		};
	}

	// Instance state update
	return {
		type: "instance.state",
		instanceId: agent.instanceId,
		taskId: agent.taskId,
		state: {
			instanceId: agent.instanceId,
			taskId: agent.taskId,
			definitionName: agent.definitionName,
			state: "running",
			startTime: now - 45000,
			endTime: null,
			turnCount: agent.turnCount,
			lastActivityAt: now,
			currentTool: agent.currentTool,
			error: null,
			toolCount: agent.toolCount,
			currentToolStartedAt: agent.currentTool ? now : null,
			durationMs: 45000 + Math.floor(Math.random() * 10000),
		},
		timestamp: now,
	} as unknown as SubAgentEvent;
}
