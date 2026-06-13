/**
 * Goal v2 extension — separated concerns:
 * - types.ts   : Domain types
 * - core.ts    : Pure state management (heart of the algorithm)
 * - policy.ts  : Lifecycle transition validators
 * - prompts.ts : All LLM-facing text
 * - utils.ts   : Helpers, validation, formatting
 * - context-store.ts : Markdown file persistence
 * - auditor.ts : Optional completion auditor
 * - widget.ts  : Above-editor widget
 * - index.ts   : Extension wiring (this file)
 */

import { StringEnum } from "@earendil-works/pi-ai";
import { compact, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readLionState } from "@local/pi-subagents";
import { Type } from "typebox";
import { loadAuditorConfig, runGoalAuditor } from "./auditor.js";
import { GoalContextTracker, type GoalFileDocument } from "./context-store.js";
import {
	accountElapsed,
	activateDraft,
	buildPersistedState,
	clearGoal,
	createCore,
	createDraft,
	currentDraftSnapshot,
	currentGoalSnapshot,
	reactivateGoal,
	restoreFromState,
	setGoal,
	setGoalContextPath,
	setGoalMode,
	setGoalPhase,
	setGoalStatus,
	updateDraft,
} from "./core.js";
import {
	canAbort,
	canActivateDraft,
	canClear,
	canCreateDraft,
	canMarkBlocked,
	canMarkComplete,
	canPause,
	canProposeDraft,
	canRecordProgress,
	canResume,
	canSetActiveGoal,
	canUpdateDraft,
} from "./policy.js";
import {
	activeGoalSystemPrompt,
	continuationPrompt,
	draftingSystemPrompt,
	goalCompactionInstructions,
	postAuditorReminder,
} from "./prompts.js";
import type { PersistedGoalState } from "./types.js";
import { goalResponse, goalSummary, validateObjective } from "./utils.js";
import { updateGoalWidget } from "./widget.js";

const STATE_TYPE = "goal-v2";
const UI_MESSAGE_TYPE = "goal-v2-ui";
const CONTINUATION_MESSAGE_TYPE = "goal-v2-continuation";
const AUTO_CONFIRM_ENV = "PI_GOAL_AUTO_CONFIRM";

const GOAL_TOOL_NAMES = [
	"get_goal",
	"create_goal",
	"update_goal",
	"record_goal_progress",
	"propose_goal_draft",
	"goal_question",
	"goal_questionnaire",
	"abort_goal",
];

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

const ProposeGoalDraftParams = Type.Object({
	objective: Type.Optional(
		Type.String({
			description: "Refined objective. If omitted, the current clarified objective is kept.",
		}),
	),
	success_criteria: Type.Optional(Type.Array(Type.String())),
	relevant_files: Type.Optional(Type.Array(Type.String())),
	constraints: Type.Optional(Type.Array(Type.String())),
	notes: Type.Optional(Type.Array(Type.String())),
});

const GoalQuestionParams = Type.Object({
	question: Type.String({
		description: "A single focused question to ask the user.",
	}),
});

const GoalQuestionnaireParams = Type.Object({
	questions: Type.Array(
		Type.String({
			description: "A structured question to ask the user.",
		}),
	),
});

const AbortGoalParams = Type.Object({
	reason: Type.Optional(Type.String({ description: "Reason for aborting the goal or draft." })),
});

export default function goalV2Extension(pi: ExtensionAPI) {
	const core = createCore();

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

		const available = new Set(pi.getAllTools().map((tool) => tool.name));
		const mode = core.mode;

		function add(name: string) {
			if (available.has(name)) active.add(name);
		}

		add("get_goal");

		if (mode === "idle") {
			add("create_goal");
		}

		if (mode === "drafting" && !isLionBuilding(ctx)) {
			add("propose_goal_draft");
			add("goal_question");
			add("goal_questionnaire");
			add("abort_goal");
		}

		if ((mode === "active" || core.goal) && !isLionBuilding(ctx)) {
			add("update_goal");
			add("record_goal_progress");
			add("abort_goal");
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

	function refreshUI(ctx: ExtensionContext): void {
		updateStatus(ctx);
		updateGoalWidget(ctx, core);
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

	function tracker(ctx: ExtensionContext): GoalContextTracker {
		return new GoalContextTracker(ctx.sessionManager.getCwd(), ctx.sessionManager.getSessionId());
	}

	async function initializeGoalContext(ctx: ExtensionContext): Promise<void> {
		if (!core.goal) return;
		const t = tracker(ctx);
		await t.migrateLegacy(core.goal);
		const path = await t.initialize(core.goal);
		setGoalContextPath(core, path);
	}

	async function initializeDraftContext(ctx: ExtensionContext): Promise<void> {
		if (!core.draft) return;
		const t = tracker(ctx);
		const path = await t.initializeFromDraft(core.draft);
		core.draft.notes.push(`Context file: ${path}`);
	}

	async function recordGoalStatus(ctx: ExtensionContext, summary: string): Promise<void> {
		if (!core.goal) return;
		await tracker(ctx).recordStatus(core.goal, summary);
	}

	async function recordGoalWork(ctx: ExtensionContext, summary: string, details?: string): Promise<void> {
		if (!core.goal) return;
		await tracker(ctx).recordWork(core.goal, summary, details);
	}

	async function readGoalContext(ctx: ExtensionContext): Promise<GoalFileDocument | null> {
		if (!core.goal) return null;
		return tracker(ctx).read(core.goal);
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
		const t = tracker(ctx);
		await t.recordProgress(
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
		await tracker(ctx).recordCompletion(core.goal);
	}

	async function archiveGoal(ctx: ExtensionContext): Promise<string | null> {
		if (!core.goal) return null;
		return tracker(ctx).archive(core.goal);
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
	}

	async function reconcileContextFromDisk(ctx: ExtensionContext): Promise<void> {
		if (!core.goal) return;
		const t = tracker(ctx);
		const existing = await t.read(core.goal);
		if (!existing) {
			await t.migrateLegacy(core.goal);
			const migrated = await t.read(core.goal);
			if (migrated) {
				setGoalContextPath(core, t.getPath(core.goal.id));
			}
		} else {
			setGoalContextPath(core, t.getPath(core.goal.id));
		}
	}

	async function confirmReplace(ctx: ExtensionContext, objective: string): Promise<boolean> {
		if (!core.goal && !core.draft) return true;
		if (!ctx.hasUI) return false;
		return ctx.ui.confirm("Replace goal?", `New objective: ${objective}`);
	}

	async function startDrafting(ctx: ExtensionContext, objectiveInput: string): Promise<void> {
		const check = canCreateDraft(core, objectiveInput);
		if (!check.ok) {
			if ((core.goal || core.draft) && (await confirmReplace(ctx, objectiveInput))) {
				clearGoal(core);
				persist("clear");
			} else {
				showGoalMessage(check.message);
				return;
			}
		}

		const objective = validateObjective(objectiveInput);
		createDraft(core, objective);
		await initializeDraftContext(ctx);
		persist("set");
		syncGoalTools(ctx);
		refreshUI(ctx);
		showGoalMessage(`Drafting goal\n\n${goalDraftSummary(core.draft!)}`);

		if (process.env[AUTO_CONFIRM_ENV] === "1") {
			await activateDraftAndContinue(ctx);
			return;
		}

		const message = `I want to pursue this goal: ${objective}\n\nPlease clarify the objective, propose success criteria, and call propose_goal_draft when ready.`;
		if (ctx.isIdle()) {
			pi.sendUserMessage(message);
		} else {
			pi.sendUserMessage(message, { deliverAs: "followUp" });
		}
	}

	async function activateDraftAndContinue(ctx: ExtensionContext): Promise<void> {
		const check = canActivateDraft(core);
		if (!check.ok) {
			showGoalMessage(check.message);
			return;
		}

		activateDraft(core);
		await initializeGoalContext(ctx);
		persist("set");
		syncGoalTools(ctx);
		refreshUI(ctx);
		showGoalMessage(`Goal active\n\n${goalSummary(core.goal!)}`);
		if (!isLionBuilding(ctx)) queueContinuation(ctx);
	}

	async function setActiveGoalDirectly(ctx: ExtensionContext, objectiveInput: string): Promise<void> {
		const check = canSetActiveGoal(core);
		if (!check.ok) {
			if ((core.goal || core.draft) && (await confirmReplace(ctx, objectiveInput))) {
				clearGoal(core);
				persist("clear");
			} else {
				showGoalMessage(check.message);
				return;
			}
		}

		setGoal(core, objectiveInput);
		await initializeGoalContext(ctx);
		persist("set");
		syncGoalTools(ctx);
		refreshUI(ctx);
		showGoalMessage(`Goal active\n\n${goalSummary(core.goal!)}`);
		if (!isLionBuilding(ctx)) queueContinuation(ctx);
	}

	function goalDraftSummary(draft: import("./types.js").GoalDraft): string {
		const objective = draft.clarifiedObjective || draft.originalObjective;
		const lines = ["Goal Draft", `Objective: ${objective}`];
		if (draft.successCriteria.length) lines.push(`Success criteria: ${draft.successCriteria.join(", ")}`);
		if (draft.relevantFiles.length) lines.push(`Relevant files: ${draft.relevantFiles.join(", ")}`);
		if (draft.constraints.length) lines.push(`Constraints: ${draft.constraints.join(", ")}`);
		lines.push("", "Run /goal confirm to activate, or continue refining.");
		return lines.join("\n");
	}

	function statusMessage(): string {
		if (core.mode === "drafting" && core.draft) {
			return goalDraftSummary(core.draft);
		}
		const snapshot = currentGoalSnapshot(core);
		return snapshot ? goalSummary(snapshot) : "Usage: /goal <objective>\n\nNo goal is currently set.";
	}

	// ========================================================================
	// Event handlers
	// ========================================================================

	pi.on("session_start", async (_event, ctx) => {
		reconstructState(ctx);
		await reconcileContextFromDisk(ctx);
		syncGoalTools(ctx);
		refreshUI(ctx);
	});
	pi.on("session_tree", async (_event, ctx) => {
		reconstructState(ctx);
		await reconcileContextFromDisk(ctx);
		syncGoalTools(ctx);
		refreshUI(ctx);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		syncGoalTools(ctx);
		if (core.mode === "drafting" && core.draft && !isLionBuilding(ctx)) {
			return {
				systemPrompt: `${event.systemPrompt}\n\n${draftingSystemPrompt(core.draft)}`,
			};
		}
		const snapshot = currentGoalSnapshot(core);
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
		refreshUI(ctx);
		syncGoalTools(ctx);

		if (core.goal.status === "active" && !isLionBuilding(ctx)) {
			queueContinuation(ctx);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!GOAL_TOOL_NAMES.includes(event.toolName)) return undefined;
		if (event.toolName === "get_goal") return undefined;

		const allowed =
			(core.mode === "drafting" &&
				["propose_goal_draft", "goal_question", "goal_questionnaire", "abort_goal"].includes(event.toolName)) ||
			((core.mode === "active" ||
				core.goal?.status === "active" ||
				core.goal?.status === "paused" ||
				core.goal?.status === "blocked") &&
				["update_goal", "record_goal_progress", "abort_goal"].includes(event.toolName)) ||
			(core.mode === "idle" && event.toolName === "create_goal");

		if (allowed && !isLionBuilding(ctx)) return undefined;
		syncGoalTools(ctx);
		return {
			block: true,
			reason: "goal-v2 tools are gated by the current goal lifecycle phase and Lion building state.",
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
				{ value: "set", label: "set", description: "set a goal directly without drafting" },
				{ value: "status", label: "status", description: "show current goal or draft" },
				{ value: "pause", label: "pause", description: "pause the current goal" },
				{ value: "resume", label: "resume", description: "resume the current goal" },
				{ value: "clear", label: "clear", description: "clear the current goal or draft" },
				{ value: "confirm", label: "confirm", description: "confirm the current draft" },
			];
			const filtered = items.filter((item) => item.value.startsWith(prefix.trimStart()));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			if (!trimmed) {
				showGoalMessage(statusMessage());
				refreshUI(ctx);
				return;
			}

			const lower = trimmed.toLowerCase();
			const firstSpace = trimmed.indexOf(" ");
			const subcommand = firstSpace === -1 ? lower : lower.slice(0, firstSpace);
			const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

			switch (subcommand) {
				case "status": {
					showGoalMessage(statusMessage());
					refreshUI(ctx);
					return;
				}
				case "set": {
					if (!rest) {
						showGoalMessage("Usage: /goal set <objective>");
						return;
					}
					await setActiveGoalDirectly(ctx, rest);
					return;
				}
				case "clear": {
					const check = canClear(core);
					if (!check.ok) {
						showGoalMessage(check.message);
						return;
					}
					if (core.goal) {
						await recordGoalStatus(ctx, "Goal cleared");
					}
					clearGoal(core);
					persist("clear");
					syncGoalTools(ctx);
					showGoalMessage("Goal cleared");
					refreshUI(ctx);
					return;
				}
				case "pause": {
					const check = canPause(core);
					if (!check.ok) {
						showGoalMessage(check.message);
						return;
					}
					try {
						setGoalStatus(core, "paused");
						await recordGoalStatus(ctx, "Goal paused");
						persist("status");
						syncGoalTools(ctx);
						showGoalMessage(`Goal paused\n\n${goalSummary(core.goal!)}`);
						refreshUI(ctx);
					} catch (err) {
						showGoalMessage(`Failed to update thread goal: ${err instanceof Error ? err.message : String(err)}`);
					}
					return;
				}
				case "resume": {
					const check = canResume(core);
					if (!check.ok) {
						showGoalMessage(check.message);
						return;
					}
					try {
						setGoalStatus(core, "active");
						await recordGoalStatus(ctx, "Goal resumed");
						persist("status");
						syncGoalTools(ctx);
						showGoalMessage(`Goal active\n\n${goalSummary(currentGoalSnapshot(core)!)}`);
						refreshUI(ctx);
						if (!isLionBuilding(ctx)) queueContinuation(ctx);
					} catch (err) {
						showGoalMessage(`Failed to update thread goal: ${err instanceof Error ? err.message : String(err)}`);
					}
					return;
				}
				case "confirm": {
					await activateDraftAndContinue(ctx);
					return;
				}
			}

			await startDrafting(ctx, args);
		},
	});

	// ========================================================================
	// Tools
	// ========================================================================

	pi.registerTool({
		name: "get_goal",
		label: "Get Goal",
		description: "Get the current goal or draft for this thread, including status and elapsed-time usage.",
		promptSnippet: "Get the current long-running thread goal/draft and its elapsed-time state",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (core.mode === "drafting" && core.draft) {
				const draft = currentDraftSnapshot(core)!;
				const response = {
					goal: null,
					draft: {
						threadId: ctx.sessionManager.getSessionId(),
						...draft,
					},
				};
				return {
					content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
					details: response,
				};
			}
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
			const check = canSetActiveGoal(core);
			if (!check.ok) {
				throw new Error(check.message);
			}
			setGoal(core, params.objective);
			await initializeGoalContext(ctx);
			persist("set");
			syncGoalTools(ctx);
			refreshUI(ctx);
			const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId());
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: response,
			};
		},
	});

	pi.registerTool({
		name: "propose_goal_draft",
		label: "Propose Goal Draft",
		description:
			"Propose a refined draft of the goal during the drafting phase. In headless mode or with PI_GOAL_AUTO_CONFIRM=1, the draft is activated immediately. In interactive mode, the user confirms before activation.",
		promptSnippet: "Submit a refined goal draft for user confirmation",
		parameters: ProposeGoalDraftParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const check = canProposeDraft(core);
			if (!check.ok) {
				throw new Error(check.message);
			}

			updateDraft(core, {
				clarifiedObjective: params.objective,
				successCriteria: params.success_criteria,
				relevantFiles: params.relevant_files,
				constraints: params.constraints,
				notes: params.notes,
			});
			persist("status");

			const autoConfirm = process.env[AUTO_CONFIRM_ENV] === "1" || !ctx.hasUI;
			if (!autoConfirm) {
				const confirmed = await ctx.ui.confirm("Confirm goal draft?", goalDraftSummary(core.draft!));
				if (!confirmed) {
					showGoalMessage("Draft not confirmed. Continue refining, or run /goal clear to cancel.");
					return {
						content: [{ type: "text", text: "Draft not confirmed. Continue refining." }],
						details: { confirmed: false },
					};
				}
			}

			await activateDraftAndContinue(ctx);
			const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId());
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: response,
			};
		},
	});

	pi.registerTool({
		name: "goal_question",
		label: "Goal Question",
		description: "Ask the user one focused clarifying question during goal drafting.",
		promptSnippet: "Ask a single focused question to clarify the goal",
		parameters: GoalQuestionParams,
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const check = canUpdateDraft(core);
			if (!check.ok) {
				throw new Error(check.message);
			}
			return {
				content: [
					{ type: "text", text: `Please answer this question so I can refine the goal:\n${params.question}` },
				],
				details: { question: params.question },
			};
		},
	});

	pi.registerTool({
		name: "goal_questionnaire",
		label: "Goal Questionnaire",
		description: "Ask the user multiple structured questions during goal drafting.",
		promptSnippet: "Ask multiple structured questions to clarify the goal",
		parameters: GoalQuestionnaireParams,
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const check = canUpdateDraft(core);
			if (!check.ok) {
				throw new Error(check.message);
			}
			const text = [
				"Please answer these questions so I can refine the goal:",
				...params.questions.map((q, i) => `${i + 1}. ${q}`),
			].join("\n");
			return {
				content: [{ type: "text", text }],
				details: { questions: params.questions },
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
				const check = canMarkBlocked(core, params.blocker_reason);
				if (!check.ok) {
					throw new Error(check.message);
				}
				setGoalPhase(core, "blocked", params.blocker_reason);
				const blockerReason = params.blocker_reason!;
				await recordGoalProgress(ctx, {
					kind: "blocker",
					summary: "Goal blocked",
					details: blockerReason,
					blockers: [blockerReason],
				});
				persist("status");
				syncGoalTools(ctx);
				refreshUI(ctx);
				const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId());
				return {
					content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
					details: response,
				};
			}

			const check = canMarkComplete(core);
			if (!check.ok) {
				throw new Error(check.message);
			}

			setGoalStatus(core, "complete");
			await recordGoalCompletion(ctx);
			persist("status");
			syncGoalTools(ctx);
			refreshUI(ctx);

			const auditorEnabled = process.env.PI_GOAL_AUDITOR_MODEL || (await auditorConfigExists(ctx));
			if (!auditorEnabled) {
				const archivePath = await archiveGoal(ctx);
				clearGoal(core);
				persist("clear");
				syncGoalTools(ctx);
				refreshUI(ctx);
				showGoalMessage(`Goal complete${archivePath ? `\n\nArchived: ${archivePath}` : ""}`);
				const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId());
				return {
					content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
					details: response,
				};
			}

			const goalForAudit = core.goal!;
			setGoalMode(core, "auditing");
			persist("status");
			refreshUI(ctx);

			const contextPath = goalForAudit.contextPath;
			let auditResult: Awaited<ReturnType<typeof runGoalAuditor>>;
			try {
				auditResult = await runGoalAuditor(ctx, contextPath ?? `${ctx.cwd}/.pi/goals/unknown.md`);
			} catch (error) {
				auditResult = {
					approved: false,
					reason: `Auditor failed: ${error instanceof Error ? error.message : String(error)}`,
				};
			}

			if (auditResult.approved) {
				const archivePath = await archiveGoal(ctx);
				clearGoal(core);
				persist("clear");
				syncGoalTools(ctx);
				refreshUI(ctx);
				showGoalMessage(
					`Goal complete${archivePath ? `\n\nArchived: ${archivePath}` : ""}\n\n${postAuditorReminder(true)}`,
				);
			} else {
				reactivateGoal(core);
				persist("status");
				syncGoalTools(ctx);
				refreshUI(ctx);
				showGoalMessage(postAuditorReminder(false, auditResult.reason));
			}

			const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId());
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: response,
			};
		},
	});

	async function auditorConfigExists(ctx: ExtensionContext): Promise<boolean> {
		const config = await loadAuditorConfig(ctx.cwd);
		return Boolean(config.model || config.provider);
	}

	pi.registerTool({
		name: "abort_goal",
		label: "Abort Goal",
		description: "Abort the current goal or draft without completing it.",
		promptSnippet: "Abort the current goal or draft",
		parameters: AbortGoalParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const check = canAbort(core);
			if (!check.ok) {
				throw new Error(check.message);
			}
			if (core.goal) {
				await recordGoalStatus(ctx, params.reason ? `Goal aborted: ${params.reason}` : "Goal aborted");
				await archiveGoal(ctx);
			}
			clearGoal(core);
			persist("clear");
			syncGoalTools(ctx);
			refreshUI(ctx);
			showGoalMessage(params.reason ? `Goal aborted: ${params.reason}` : "Goal aborted");
			return {
				content: [{ type: "text", text: "Goal/draft aborted." }],
				details: { aborted: true },
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
			const check = canRecordProgress(core);
			if (!check.ok) {
				throw new Error(check.message);
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
			refreshUI(ctx);
			const response = goalResponse(currentGoalSnapshot(core), ctx.sessionManager.getSessionId());
			return {
				content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
				details: response,
			};
		},
	});
}
