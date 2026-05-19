/**
 * Goal v2 extension — separated concerns:
 * - types.ts   : Domain types
 * - core.ts    : Pure state management (heart of the algorithm)
 * - prompts.ts : All LLM-facing text
 * - utils.ts   : Helpers, validation, formatting
 * - index.ts   : Extension wiring (this file)
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	accountElapsed,
	addTokens,
	buildPersistedState,
	clearGoal,
	createCore,
	currentGoalSnapshot,
	maybeApplyBudgetLimit,
	restoreFromState,
	setGoal,
	setGoalStatus,
} from "./core.js";
import { activeGoalSystemPrompt, continuationPrompt } from "./prompts.js";
import type { PersistedGoalState } from "./types.js";
import { assistantUsageTokens, goalResponse, goalSummary, validateObjective } from "./utils.js";

const STATE_TYPE = "goal-v2";
const UI_MESSAGE_TYPE = "goal-v2-ui";
const CONTINUATION_MESSAGE_TYPE = "goal-v2-continuation";

const CreateGoalParams = Type.Object({
	objective: Type.String({
		description:
			"Required. The concrete objective to start pursuing. This starts a new active goal only when no goal is currently defined; if a goal already exists, this tool fails.",
	}),
	token_budget: Type.Optional(Type.Number({ description: "Optional positive token budget for the new active goal." })),
});

const UpdateGoalParams = Type.Object({
	status: StringEnum(["complete"] as const),
});

export default function goalV2Extension(pi: ExtensionAPI) {
	const core = createCore();

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
				const snapshot = currentGoalSnapshot(core) ?? core.goal;
				const usage =
					snapshot.tokenBudget === undefined ? "" : ` (${snapshot.tokensUsed} / ${snapshot.tokenBudget})`;
				ctx.ui.setStatus("goal-v2", theme.fg("accent", `Pursuing goal${usage}`));
				break;
			}
			case "paused":
				ctx.ui.setStatus("goal-v2", theme.fg("warning", "Goal paused (/goal resume)"));
				break;
			case "budgetLimited":
				ctx.ui.setStatus("goal-v2", theme.fg("warning", "Goal budget reached"));
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
			ctx.ui.notify(
				`Failed to queue goal continuation: ${err instanceof Error ? err.message : String(err)}`,
				"error",
			);
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

	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	pi.on("before_agent_start", async (event) => {
		const snapshot = currentGoalSnapshot(core);
		if (!snapshot || snapshot.status !== "active") return;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${activeGoalSystemPrompt(snapshot)}`,
		};
	});

	pi.on("agent_start", async (_event, _ctx) => {
		core.continuationQueued = false;
		core.activeGoalIdAtAgentStart = core.goal?.status === "active" ? core.goal.id : null;
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!core.goal) return;
		let changed = false;

		if (core.activeGoalIdAtAgentStart === core.goal.id) {
			const tokens = assistantUsageTokens(event.messages as unknown[]);
			if (tokens > 0 && addTokens(core, tokens)) {
				changed = true;
			}
		}

		if (core.goal.status === "active" && accountElapsed(core)) {
			changed = true;
		}

		if (maybeApplyBudgetLimit(core)) {
			changed = true;
			showGoalMessage(`Goal limited by budget\n\n${goalSummary(core.goal)}`);
		}

		if (changed) persist("account");
		updateStatus(ctx);
		core.activeGoalIdAtAgentStart = null;

		if (core.goal.status === "active") {
			queueContinuation(ctx);
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
					const cleared = clearGoal(core);
					persist("clear");
					showGoalMessage(
						cleared ? "Goal cleared" : "No goal to clear\n\nThis thread does not currently have a goal.",
					);
					updateStatus(ctx);
					return;
				}
				case "pause": {
					try {
						setGoalStatus(core, "paused");
						persist("status");
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
						persist("status");
						showGoalMessage(`Goal active\n\n${goalSummary(currentGoalSnapshot(core)!)}`);
						updateStatus(ctx);
						queueContinuation(ctx);
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
			persist("set");
			showGoalMessage(`Goal active\n\n${goalSummary(core.goal!)}`);
			updateStatus(ctx);
			queueContinuation(ctx);
		},
	});

	// ========================================================================
	// Tools
	// ========================================================================

	pi.registerTool({
		name: "get_goal",
		label: "Get Goal",
		description:
			"Get the current goal for this thread, including status, budgets, token and elapsed-time usage, and remaining token budget.",
		promptSnippet: "Get the current long-running thread goal and its usage/budget state",
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
			"Create a goal only when explicitly requested by the user or system/developer instructions; do not infer goals from ordinary tasks. Set token_budget only when an explicit token budget is requested. Fails if a goal exists; use update_goal only for status.",
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
			setGoal(core, params.objective, params.token_budget);
			persist("set");
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
			"Update the existing goal. Use this tool only to mark the goal achieved. Set status to complete only when the objective has actually been achieved and no required work remains. Do not mark a goal complete merely because its budget is nearly exhausted or because you are stopping work.",
		promptSnippet: "Mark the current goal complete after verifying all requirements are satisfied",
		promptGuidelines: [
			"Use update_goal only to mark the active goal complete after verifying the objective is achieved; never use it for pause, resume, or budget-limit changes.",
		],
		parameters: UpdateGoalParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (params.status !== "complete") {
				throw new Error(
					"update_goal can only mark the existing goal complete; pause, resume, and budget-limited status changes are controlled by the user or system",
				);
			}
			setGoalStatus(core, "complete");
			persist("status");
			updateStatus(ctx);
			const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId(), true);
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: response,
			};
		},
	});
}
