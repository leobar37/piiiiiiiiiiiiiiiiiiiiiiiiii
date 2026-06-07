/**
 * Goal v2 extension — separated concerns:
 * - types.ts   : Domain types
 * - core.ts    : Pure state management (heart of the algorithm)
 * - prompts.ts : All LLM-facing text
 * - utils.ts   : Helpers, validation, formatting
 * - index.ts   : Extension wiring (this file)
 */

import { StringEnum } from "@earendil-works/pi-ai";
import { compact, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readLionState } from "@local/pi-subagents";
import { Type } from "typebox";
import { GoalContextTracker } from "./context-store.js";
import {
	accountElapsed,
	buildPersistedState,
	clearGoal,
	createCore,
	currentGoalSnapshot,
	restoreFromState,
	setGoal,
	setGoalPhase,
	setGoalStatus,
} from "./core.js";
import { activeGoalSystemPrompt, continuationPrompt, goalCompactionInstructions } from "./prompts.js";
import type { GoalContextDocument, PersistedGoalState } from "./types.js";
import { goalResponse, goalSummary, validateObjective } from "./utils.js";

const STATE_TYPE = "goal-v2";
const UI_MESSAGE_TYPE = "goal-v2-ui";
const CONTINUATION_MESSAGE_TYPE = "goal-v2-continuation";
const GOAL_TOOL_NAMES = ["get_goal", "create_goal", "update_goal", "record_goal_progress"];

const CreateGoalParams = Type.Object({
	objective: Type.String({
		description:
			"Required. The concrete objective to start pursuing. This starts a new active goal only when no goal is currently defined; if a goal already exists, this tool fails.",
	}),
});

const UpdateGoalParams = Type.Object({
	status: StringEnum(["complete", "blocked"] as const),
	blocker_reason: Type.Optional(
		Type.String({
			description: "Required when status is blocked. Explain the missing user input or external-state change.",
		}),
	),
});

const RecordGoalProgressParams = Type.Object({
	kind: StringEnum(["context", "plan", "work", "verification", "blocker", "decision", "status"] as const),
	summary: Type.String({
		description: "Concise durable progress summary.",
	}),
	details: Type.Optional(Type.String({ description: "Additional details to persist in the goal context." })),
	evidence: Type.Optional(
		Type.Array(Type.String({ description: "Concrete evidence such as files, commands, or results." })),
	),
	phase: Type.Optional(
		StringEnum(["context_gathering", "executing", "verifying", "blocked"] as const, {
			description: "Current phase after recording this progress.",
		}),
	),
	success_criteria: Type.Optional(Type.Array(Type.String())),
	relevant_files: Type.Optional(Type.Array(Type.String())),
	constraints: Type.Optional(Type.Array(Type.String())),
	blockers: Type.Optional(Type.Array(Type.String())),
	notes: Type.Optional(Type.Array(Type.String())),
});

export default function goalV2Extension(pi: ExtensionAPI) {
	const core = createCore();

	function hasActiveGoalTools(): boolean {
		return core.goal?.status === "active";
	}

	function isLionBuilding(ctx: ExtensionContext): boolean {
		const cwd = ctx.cwd ?? ctx.sessionManager.getCwd();
		const saved = readLionState(cwd, ctx);
		return saved?.state.active === true && saved.state.phase === "building";
	}

	function syncGoalTools(ctx: ExtensionContext): void {
		const active = new Set(pi.getActiveTools());
		for (const tool of GOAL_TOOL_NAMES) {
			active.delete(tool);
		}

		if (hasActiveGoalTools() && !isLionBuilding(ctx)) {
			const available = new Set(pi.getAllTools().map((tool) => tool.name));
			for (const tool of GOAL_TOOL_NAMES) {
				if (available.has(tool)) active.add(tool);
			}
		}

		pi.setActiveTools([...active]);
	}

	function persist(action: PersistedGoalState["action"]): void {
		pi.appendEntry(STATE_TYPE, buildPersistedState(core, action));
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (!core.goal) {
			ctx.ui.setStatus("goal-v2", undefined);
			return;
		}
		const theme = ctx.ui.theme;
		switch (core.goal.status) {
			case "active": {
				ctx.ui.setStatus("goal-v2", theme.fg("accent", "Pursuing goal"));
				break;
			}
			case "paused":
				ctx.ui.setStatus("goal-v2", theme.fg("warning", "Goal paused (/goal resume)"));
				break;
			case "blocked":
				ctx.ui.setStatus("goal-v2", theme.fg("warning", "Goal blocked (/goal resume)"));
				break;
			case "complete":
				ctx.ui.setStatus("goal-v2", theme.fg("success", "Goal complete"));
				break;
		}
	}

	function showGoalMessage(content: string): void {
		pi.sendMessage(
			{
				customType: UI_MESSAGE_TYPE,
				content,
				display: true,
			},
			{ triggerTurn: false },
		);
	}

	async function initializeGoalContext(ctx: ExtensionContext): Promise<void> {
		if (!core.goal) return;
		const tracker = new GoalContextTracker(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionId());
		core.goal.contextPath = await tracker.initialize(core.goal);
	}

	async function recordGoalStatus(ctx: ExtensionContext, summary: string): Promise<void> {
		if (!core.goal) return;
		const tracker = new GoalContextTracker(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionId());
		await tracker.recordStatus(core.goal, summary);
	}

	async function recordGoalWork(ctx: ExtensionContext, summary: string, details?: string): Promise<void> {
		if (!core.goal) return;
		const tracker = new GoalContextTracker(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionId());
		await tracker.recordWork(core.goal, summary, details);
	}

	async function readGoalContext(ctx: ExtensionContext): Promise<GoalContextDocument | null> {
		if (!core.goal) return null;
		const tracker = new GoalContextTracker(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionId());
		return tracker.read(core.goal);
	}

	async function recordGoalProgress(
		ctx: ExtensionContext,
		params: {
			kind: "context" | "plan" | "work" | "verification" | "blocker" | "decision" | "status";
			summary: string;
			details?: string;
			evidence?: string[];
			success_criteria?: string[];
			relevant_files?: string[];
			constraints?: string[];
			blockers?: string[];
			notes?: string[];
		},
	): Promise<void> {
		if (!core.goal) return;
		const tracker = new GoalContextTracker(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionId());
		await tracker.recordProgress(
			core.goal,
			{
				kind: params.kind,
				summary: params.summary,
				details: params.details,
				evidence: params.evidence,
			},
			{
				successCriteria: params.success_criteria,
				relevantFiles: params.relevant_files,
				constraints: params.constraints,
				blockers: params.blockers,
				notes: params.notes,
			},
		);
	}

	async function recordGoalCompletion(ctx: ExtensionContext): Promise<void> {
		if (!core.goal) return;
		const tracker = new GoalContextTracker(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionId());
		await tracker.recordCompletion(core.goal);
	}

	function queueContinuation(ctx: ExtensionContext): void {
		const snapshot = currentGoalSnapshot(core);
		if (!snapshot || snapshot.status !== "active") return;
		if (core.continuationQueued || ctx.hasPendingMessages()) return;

		core.continuationQueued = true;
		const message = {
			customType: CONTINUATION_MESSAGE_TYPE,
			content: continuationPrompt(snapshot),
			display: false,
			details: { goalId: snapshot.id },
		};
		try {
			if (ctx.isIdle()) {
				pi.sendMessage(message, { triggerTurn: true });
			} else {
				pi.sendMessage(message, { triggerTurn: true, deliverAs: "followUp" });
			}
		} catch (err) {
			core.continuationQueued = false;
			if (ctx.hasUI) {
				ctx.ui.notify(
					`Failed to queue goal continuation: ${err instanceof Error ? err.message : String(err)}`,
					"error",
				);
			}
		}
	}

	function reconstructState(ctx: ExtensionContext): void {
		let lastState: PersistedGoalState | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== STATE_TYPE) continue;
			lastState = entry.data as PersistedGoalState | undefined;
		}
		restoreFromState(core, lastState);
		updateStatus(ctx);
	}

	// ========================================================================
	// Event handlers
	// ========================================================================

	pi.on("session_start", async (_event, ctx) => {
		reconstructState(ctx);
		syncGoalTools(ctx);
	});
	pi.on("session_tree", async (_event, ctx) => {
		reconstructState(ctx);
		syncGoalTools(ctx);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const snapshot = currentGoalSnapshot(core);
		syncGoalTools(ctx);
		if (!snapshot || snapshot.status !== "active" || isLionBuilding(ctx)) return;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${activeGoalSystemPrompt(snapshot)}`,
		};
	});

	pi.on("agent_start", async (_event, _ctx) => {
		core.continuationQueued = false;
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (!core.goal) return;
		let changed = false;

		if (core.goal.status === "active" && accountElapsed(core)) {
			changed = true;
		}

		if (changed) {
			await recordGoalWork(ctx, "Agent turn completed", `Elapsed time: ${core.goal.timeUsedSeconds} seconds`);
			persist("account");
		}
		updateStatus(ctx);
		syncGoalTools(ctx);

		if (core.goal.status === "active" && !isLionBuilding(ctx)) {
			queueContinuation(ctx);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!GOAL_TOOL_NAMES.includes(event.toolName)) return undefined;
		if (hasActiveGoalTools() && !isLionBuilding(ctx)) return undefined;
		syncGoalTools(ctx);
		return {
			block: true,
			reason: "goal-v2 tools are inactive until /goal starts an active goal and Lion is not building.",
		};
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const snapshot = currentGoalSnapshot(core);
		if (!snapshot || snapshot.status === "complete" || !ctx.model) return;
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
		if (!auth.ok) return;

		const instructionParts = [
			event.customInstructions,
			goalCompactionInstructions(snapshot, await readGoalContext(ctx)),
		]
			.filter(Boolean)
			.join("\n\n");

		try {
			const compaction = await compact(
				event.preparation,
				ctx.model,
				auth.apiKey ?? "",
				auth.headers,
				instructionParts,
				event.signal,
			);
			return { compaction };
		} catch (error) {
			if (ctx.hasUI) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Goal compaction failed: ${message}`, "warning");
			}
			return;
		}
	});

	pi.on("context", async (event) => {
		let lastContinuationIndex = -1;
		for (let i = 0; i < event.messages.length; i++) {
			const msg = event.messages[i] as { customType?: string; details?: { goalId?: string } };
			if (msg.customType === CONTINUATION_MESSAGE_TYPE && msg.details?.goalId === core.goal?.id) {
				lastContinuationIndex = i;
			}
		}

		return {
			messages: event.messages.filter((message, index) => {
				const msg = message as { customType?: string; details?: { goalId?: string } };
				if (msg.customType === UI_MESSAGE_TYPE) return false;
				if (msg.customType === CONTINUATION_MESSAGE_TYPE) {
					return (
						core.goal?.status === "active" &&
						msg.details?.goalId === core.goal.id &&
						index === lastContinuationIndex
					);
				}
				return true;
			}),
		};
	});

	// ========================================================================
	// Command: /goal
	// ========================================================================

	pi.registerCommand("goal", {
		description: "Set or view the goal for a long-running task (v2)",
		getArgumentCompletions: (prefix: string) => {
			const items = [
				{ value: "clear", label: "clear", description: "clear the current goal" },
				{ value: "pause", label: "pause", description: "pause the current goal" },
				{ value: "resume", label: "resume", description: "resume the current goal" },
			];
			const filtered = items.filter((item) => item.value.startsWith(prefix.trimStart()));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				const snapshot = currentGoalSnapshot(core);
				showGoalMessage(snapshot ? goalSummary(snapshot) : "Usage: /goal <objective>\n\nNo goal is currently set.");
				updateStatus(ctx);
				return;
			}

			switch (trimmed.toLowerCase()) {
				case "clear": {
					const previousGoal = core.goal;
					if (previousGoal) {
						await recordGoalStatus(ctx, "Goal cleared");
					}
					const cleared = clearGoal(core);
					persist("clear");
					syncGoalTools(ctx);
					showGoalMessage(
						cleared ? "Goal cleared" : "No goal to clear\n\nThis thread does not currently have a goal.",
					);
					updateStatus(ctx);
					return;
				}
				case "pause": {
					try {
						setGoalStatus(core, "paused");
						await recordGoalStatus(ctx, "Goal paused");
						persist("status");
						syncGoalTools(ctx);
						showGoalMessage(`Goal paused\n\n${goalSummary(core.goal!)}`);
						updateStatus(ctx);
					} catch (err) {
						showGoalMessage(`Failed to update thread goal: ${err instanceof Error ? err.message : String(err)}`);
					}
					return;
				}
				case "resume": {
					try {
						setGoalStatus(core, "active");
						await recordGoalStatus(ctx, "Goal resumed");
						persist("status");
						syncGoalTools(ctx);
						showGoalMessage(`Goal active\n\n${goalSummary(currentGoalSnapshot(core)!)}`);
						updateStatus(ctx);
						if (!isLionBuilding(ctx)) queueContinuation(ctx);
					} catch (err) {
						showGoalMessage(`Failed to update thread goal: ${err instanceof Error ? err.message : String(err)}`);
					}
					return;
				}
			}

			let objective: string;
			try {
				objective = validateObjective(args);
			} catch (err) {
				showGoalMessage(err instanceof Error ? err.message : String(err));
				return;
			}

			if (core.goal) {
				if (!ctx.hasUI) {
					showGoalMessage(
						"A goal already exists. Run /goal clear first, or use interactive mode to confirm replacement.",
					);
					return;
				}
				const replace = await ctx.ui.confirm("Replace goal?", `New objective: ${objective}`);
				if (!replace) return;
			}

			setGoal(core, objective);
			await initializeGoalContext(ctx);
			persist("set");
			syncGoalTools(ctx);
			showGoalMessage(`Goal active\n\n${goalSummary(core.goal!)}`);
			updateStatus(ctx);
			if (!isLionBuilding(ctx)) queueContinuation(ctx);
		},
	});

	// ========================================================================
	// Tools
	// ========================================================================

	pi.registerTool({
		name: "get_goal",
		label: "Get Goal",
		description: "Get the current goal for this thread, including status and elapsed-time usage.",
		promptSnippet: "Get the current long-running thread goal and its elapsed-time state",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const snapshot = currentGoalSnapshot(core);
			const response = goalResponse(snapshot, ctx.sessionManager.getSessionId());
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: response,
			};
		},
	});

	pi.registerTool({
		name: "create_goal",
		label: "Create Goal",
		description:
			"Create a goal only when explicitly requested by the user or system/developer instructions; do not infer goals from ordinary tasks. Fails if a goal exists; use update_goal only for status.",
		promptSnippet: "Create a new active long-running thread goal when explicitly requested",
		promptGuidelines: [
			"Use create_goal only when the user explicitly asks to create a long-running goal; do not infer goals from ordinary tasks.",
			"Use update_goal with status complete only when the active goal is actually achieved and no required work remains.",
		],
		parameters: CreateGoalParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (core.goal) {
				throw new Error(
					"cannot create a new goal because this thread already has a goal; use update_goal only when the existing goal is complete",
				);
			}
			setGoal(core, params.objective);
			await initializeGoalContext(ctx);
			persist("set");
			syncGoalTools(ctx);
			updateStatus(ctx);
			const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId());
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: response,
			};
		},
	});

	pi.registerTool({
		name: "update_goal",
		label: "Update Goal",
		description:
			"Update the existing goal. Use this tool only to mark the goal achieved or genuinely blocked. Set status to complete only when the objective has actually been achieved and no required work remains. Set status to blocked only when progress requires missing user input or an external-state change.",
		promptSnippet: "Mark the current goal complete or blocked after verifying the actual state",
		promptGuidelines: [
			"Use update_goal with status complete only after verifying the objective is achieved; never use it for pause or resume changes.",
			"Use update_goal with status blocked only after recording the blocker and confirming no useful progress can continue without user input or an external-state change.",
		],
		parameters: UpdateGoalParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (params.status === "blocked") {
				const blockerReason = params.blocker_reason?.trim();
				if (!blockerReason) {
					throw new Error("blocker_reason is required when marking a goal blocked");
				}
				setGoalPhase(core, "blocked", blockerReason);
				await recordGoalProgress(ctx, {
					kind: "blocker",
					summary: "Goal blocked",
					details: blockerReason,
					blockers: [blockerReason],
				});
			} else {
				setGoalStatus(core, "complete");
				await recordGoalCompletion(ctx);
			}
			persist("status");
			syncGoalTools(ctx);
			updateStatus(ctx);
			const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId());
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: response,
			};
		},
	});

	pi.registerTool({
		name: "record_goal_progress",
		label: "Record Goal Progress",
		description:
			"Persist structured progress for the current goal: work, plans, decisions, verification evidence, relevant files, constraints, success criteria, notes, or blockers.",
		promptSnippet: "Record durable progress and evidence for the active long-running goal",
		promptGuidelines: [
			"Use record_goal_progress whenever you learn durable information needed to avoid repeating work across continuations or compactions.",
			"Record concrete evidence for verification work, including files inspected, commands run, or external state checked.",
			"Record blockers before marking a goal blocked.",
		],
		parameters: RecordGoalProgressParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!core.goal) {
				throw new Error("cannot record progress because no goal exists");
			}
			await recordGoalProgress(ctx, params);
			if (params.phase) {
				setGoalPhase(
					core,
					params.phase,
					params.phase === "blocked" ? params.blockers?.join("; ") || params.summary : undefined,
				);
				persist("status");
			}
			syncGoalTools(ctx);
			updateStatus(ctx);
			const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId());
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: response,
			};
		},
	});
}
