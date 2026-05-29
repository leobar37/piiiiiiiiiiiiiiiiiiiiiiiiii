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
let streamStep = 0;

const STREAMING_MARKDOWN = [
	"I am checking the dashboard flow.",
	"I am checking the dashboard flow.\n\n- Reading message state",
	"I am checking the dashboard flow.\n\n- Reading message state\n- Verifying `lion_tasks` rendering",
	"I am checking the dashboard flow.\n\n- Reading message state\n- Verifying `lion_tasks` rendering\n\n```ts\nconst streaming = true;\n```",
];

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
	parentThreadId?: string;
	parentToolCallId?: string;
	runId?: string;
	runIndex?: number;
	state: "running" | "completed" | "failed";
	turnCount: number;
	toolCount: number;
	currentTool: string | null;
	modelProvider?: string;
	modelId?: string;
}

export const LIVE_AGENTS: LiveAgent[] = [
	{
		instanceId: "subagent-task-1-abc123",
		taskId: "task-1",
		definitionName: "executor",
		parentThreadId: "main:mock-session",
		parentToolCallId: "main-tool-lion-tasks",
		runId: "mock-run-1",
		runIndex: 0,
		state: "running",
		turnCount: 3,
		toolCount: 4,
		currentTool: null,
		modelProvider: "kimi-coding",
		modelId: "kimi-for-coding",
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

	if (r < 0.35) {
		const text = STREAMING_MARKDOWN[streamStep % STREAMING_MARKDOWN.length];
		const type = streamStep % STREAMING_MARKDOWN.length === 0 ? "message_start" : "message_update";
		streamStep++;
		return {
			type: "session.event",
			instanceId: agent.instanceId,
			taskId: agent.taskId,
			sessionEvent: {
				type,
				message: {
					id: "mock-streaming-message",
					role: "assistant",
					content: [{ type: "text", text }],
					timestamp: now - streamStep,
				},
				assistantMessageEvent:
					type === "message_update"
						? {
								type: "text_delta",
								contentIndex: 0,
								delta: text,
							}
						: undefined,
			},
			timestamp: now,
		};
	}

	if (r < 0.45 && streamStep > 0) {
		const text = STREAMING_MARKDOWN[STREAMING_MARKDOWN.length - 1];
		streamStep = 0;
		return {
			type: "session.event",
			instanceId: agent.instanceId,
			taskId: agent.taskId,
			sessionEvent: {
				type: "message_end",
				message: {
					id: "mock-streaming-message",
					role: "assistant",
					content: [{ type: "text", text }],
					timestamp: now,
				},
			},
			timestamp: now,
		};
	}

	if (r < 0.55) {
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

	if (r < 0.7 && agent.currentTool) {
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

	if (r < 0.82) {
		// Progress update
		return {
			type: "progress.update",
			instanceId: agent.instanceId,
			taskId: agent.taskId,
			message: pickRandom(PROGRESS_MESSAGES),
			timestamp: now,
		};
	}

	if (r < 0.92) {
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
			parentThreadId: agent.parentThreadId,
			parentToolCallId: agent.parentToolCallId,
			runId: agent.runId,
			runIndex: agent.runIndex,
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
			modelProvider: agent.modelProvider,
			modelId: agent.modelId,
		},
		timestamp: now,
	} as unknown as SubAgentEvent;
}
