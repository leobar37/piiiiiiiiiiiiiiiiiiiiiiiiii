import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { GoalContextTracker, type GoalFileDocument } from "../../src/extensions/goal-v2/context-store.js";
import { createCore, setGoal, setGoalPhase, setGoalStatus } from "../../src/extensions/goal-v2/core.js";
import goalV2Extension from "../../src/extensions/goal-v2/index.js";

function testCoreTracksPhaseAndBlockedStatus(): void {
	const core = createCore();
	const goal = setGoal(core, "ship the feature");

	assert.equal(goal.status, "active");
	assert.equal(goal.phase, "context_gathering");

	setGoalPhase(core, "executing");
	assert.equal(core.goal?.status, "active");
	assert.equal(core.goal?.phase, "executing");

	setGoalPhase(core, "blocked", "waiting for credentials");
	assert.equal(core.goal?.status, "blocked");
	assert.equal(core.goal?.phase, "blocked");
	assert.equal(core.goal?.blockerReason, "waiting for credentials");

	setGoalStatus(core, "active");
	assert.equal(core.goal?.status, "active");
	assert.equal(core.goal?.phase, "executing");
	assert.equal(core.goal?.blockerReason, undefined);
}

async function testMarkdownContextPersistsStructuredProgress(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "goal-v2-"));
	try {
		const core = createCore();
		const goal = setGoal(core, "improve goal tracking");
		const tracker = new GoalContextTracker(cwd, "session-1");
		const contextPath = await tracker.initialize(goal);

		await tracker.recordProgress(
			goal,
			{
				kind: "verification",
				summary: "Checked workflow",
				details: "Validated context persistence",
				evidence: ["test/goal-v2/workflow.test.ts"],
			},
			{
				successCriteria: ["progress is durable"],
				relevantFiles: ["packages/extensions/src/extensions/goal-v2/context-store.ts"],
				constraints: ["no provider calls"],
				blockers: ["none"],
				notes: ["keep context compact"],
			},
		);

		const raw = readFileSync(contextPath, "utf8");
		assert.match(raw, /# Goal/);
		assert.match(raw, /improve goal tracking/);
		assert.match(raw, /progress is durable/);

		const doc = (await tracker.read(goal)) as GoalFileDocument;
		assert.deepEqual(doc.successCriteria, ["progress is durable"]);
		assert.deepEqual(doc.relevantFiles, ["packages/extensions/src/extensions/goal-v2/context-store.ts"]);
		assert.deepEqual(doc.constraints, ["no provider calls"]);
		assert.deepEqual(doc.blockers, ["none"]);
		assert.deepEqual(doc.notes, ["keep context compact"]);
		assert.equal(doc.iterations.at(-1)?.kind, "verification");
		assert.equal(doc.iterations.at(-1)?.summary, "Checked workflow");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testDraftingFlow(): Promise<void> {
	const pi = fakePi();
	goalV2Extension(pi.api);
	const ctx = fakeCtx(pi);

	await pi.emit("session_start", {}, ctx);
	assert.deepEqual(pi.activeTools.sort(), ["bash", "create_goal", "get_goal", "read"]);

	await pi.commands.get("goal")?.handler("ship the feature", ctx);
	assert.equal(pi.userMessages.length, 1);
	assert.match(pi.userMessages[0] ?? "", /ship the feature/);

	// Drafting tools become active.
	assert.ok(pi.activeTools.includes("propose_goal_draft"));
	assert.ok(pi.activeTools.includes("goal_question"));
	assert.ok(pi.activeTools.includes("goal_questionnaire"));

	// Direct-set mode activates immediately.
	const pi2 = fakePi();
	goalV2Extension(pi2.api);
	const ctx2 = fakeCtx(pi2);
	await pi2.emit("session_start", {}, ctx2);
	await pi2.commands.get("goal")?.handler("set ship the feature", ctx2);
	assert.ok(pi2.activeTools.includes("update_goal"));
	assert.ok(pi2.activeTools.includes("record_goal_progress"));
}

async function testGoalToolsActivateOnlyAfterGoalCommand(): Promise<void> {
	const pi = fakePi();
	goalV2Extension(pi.api);
	const ctx = fakeCtx(pi);

	await pi.emit("session_start", {}, ctx);
	assert.deepEqual(pi.activeTools.sort(), ["bash", "create_goal", "get_goal", "read"]);

	await pi.commands.get("goal")?.handler("set ship the feature", ctx);
	assert.deepEqual(pi.activeTools.sort(), [
		"abort_goal",
		"bash",
		"get_goal",
		"read",
		"record_goal_progress",
		"update_goal",
	]);
}

async function testGoalToolsStayInactiveDuringLionBuild(): Promise<void> {
	const pi = fakePi();
	goalV2Extension(pi.api);
	pi.entries.push({
		type: "custom",
		customType: "lion-state",
		data: {
			version: 2,
			active: true,
			phase: "building",
			updatedAt: Date.now(),
		},
	});
	const ctx = fakeCtx(pi);

	await pi.commands.get("goal")?.handler("set ship the feature", ctx);

	assert.deepEqual(pi.activeTools.sort(), ["bash", "get_goal", "read"]);
	assert.equal(
		pi.messages.some((message) => message.content.customType === "goal-v2-continuation"),
		false,
	);
}

async function testGoalToolsStayInactiveDuringFileBackedLionBuild(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "goal-v2-lion-build-"));
	try {
		const pi = fakePi();
		goalV2Extension(pi.api);
		writeFileBackedLionState(cwd, "building");
		const ctx = fakeCtx(pi, cwd);

		await pi.commands.get("goal")?.handler("set ship the feature", ctx);

		assert.deepEqual(pi.activeTools.sort(), ["bash", "get_goal", "read"]);
		assert.equal(
			pi.messages.some((message) => message.content.customType === "goal-v2-continuation"),
			false,
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testGoalToolsActivateDuringFileBackedLionPlanning(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "goal-v2-lion-planning-"));
	try {
		const pi = fakePi();
		goalV2Extension(pi.api);
		writeFileBackedLionState(cwd, "planning");
		const ctx = fakeCtx(pi, cwd);

		await pi.commands.get("goal")?.handler("set ship the feature", ctx);

		assert.deepEqual(pi.activeTools.sort(), [
			"abort_goal",
			"bash",
			"get_goal",
			"read",
			"record_goal_progress",
			"update_goal",
		]);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

async function testGoalToolCallBlockedWhenInactive(): Promise<void> {
	const pi = fakePi();
	goalV2Extension(pi.api);
	const ctx = fakeCtx(pi);

	const result = await pi.emit(
		"tool_call",
		{ type: "tool_call", toolName: "update_goal", toolCallId: "tool-1", input: {} },
		ctx,
	);

	assert.equal(result?.block, true);
	assert.match(String(result?.reason ?? ""), /gated/);
}

async function testLegacyJsonMigration(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "goal-v2-migration-"));
	try {
		const core = createCore();
		const goal = setGoal(core, "migrate legacy context");
		const tracker = new GoalContextTracker(cwd, "session-1");

		const legacyDir = join(cwd, ".pi", "goals", "session-1");
		mkdirSync(legacyDir, { recursive: true });
		writeFileSync(
			join(legacyDir, `${goal.id}-context.json`),
			JSON.stringify(
				{
					version: 1,
					sessionId: "session-1",
					goalId: goal.id,
					cwd,
					originalObjective: goal.objective,
					clarifiedObjective: null,
					successCriteria: ["legacy migrated"],
					relevantFiles: [],
					constraints: [],
					blockers: [],
					notes: [],
					iterations: [],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
				null,
				2,
			),
		);

		await tracker.migrateLegacy(goal);
		const doc = await tracker.read(goal);
		assert.ok(doc);
		assert.equal(doc?.successCriteria[0], "legacy migrated");

		// Legacy JSON file is removed after migration.
		assert.throws(() => readFileSync(join(legacyDir, `${goal.id}-context.json`), "utf8"));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
}

type Handler = (
	event: Record<string, unknown>,
	ctx: ExtensionContext,
) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;

interface FakeCommand {
	handler(args: string, ctx: ExtensionContext): Promise<void>;
}

interface FakeMessage {
	content: { customType?: string; content?: string };
	options: Record<string, unknown>;
}

const GOAL_INTERNAL_TOOLS = [
	"get_goal",
	"create_goal",
	"update_goal",
	"record_goal_progress",
	"propose_goal_draft",
	"goal_question",
	"goal_questionnaire",
	"abort_goal",
];

function fakePi() {
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, FakeCommand>();
	const tools = new Map<string, ToolInfo>();
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> = [];
	const messages: FakeMessage[] = [];
	const userMessages: string[] = [];
	const baseTools = ["read", "bash"];
	const activeTools = [...baseTools];

	const api = {
		on(event: string, handler: Handler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerCommand(name: string, command: FakeCommand) {
			commands.set(name, command);
		},
		registerTool(tool: ToolInfo) {
			tools.set(tool.name, tool);
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage(content: FakeMessage["content"], options: Record<string, unknown>) {
			messages.push({ content, options });
		},
		sendUserMessage(content: string | unknown[], options?: Record<string, unknown>) {
			const text = typeof content === "string" ? content : "";
			userMessages.push(text);
			if (options) {
				// noop
			}
		},
		getActiveTools() {
			return activeTools;
		},
		getAllTools() {
			return [
				...activeTools.map((name) => ({ name })),
				...GOAL_INTERNAL_TOOLS.map((name) => ({ name })),
				...Array.from(tools.values()).map((tool) => ({ name: tool.name })),
			];
		},
		setActiveTools(toolNames: string[]) {
			activeTools.splice(0, activeTools.length, ...toolNames);
		},
	} as unknown as ExtensionAPI;

	return {
		api,
		handlers,
		commands,
		tools,
		entries,
		messages,
		userMessages,
		activeTools,
		async emit(event: string, payload: Record<string, unknown>, ctx: ExtensionContext) {
			let result: Record<string, unknown> | undefined;
			for (const handler of handlers.get(event) ?? []) {
				const next = await handler(payload, ctx);
				if (next) result = next;
			}
			return result;
		},
	};
}

function writeFileBackedLionState(cwd: string, phase: "planning" | "building", sessionId = "session-1"): void {
	const statePath = join(cwd, ".pi", "lion", "state.json");
	mkdirSync(join(cwd, ".pi", "lion"), { recursive: true });
	writeFileSync(
		statePath,
		`${JSON.stringify(
			{
				version: 4,
				sessionId,
				state: {
					version: 2,
					active: true,
					strategy: "plan",
					phase,
					activePlanPath: "/tmp/test-plan",
					activePlanSlug: "test-plan",
					planKind: "structured",
					activeTaskId: null,
					maxAttempts: 3,
					lastRunId: null,
				},
				core: { activeRun: null, runHistory: [] },
				updatedAt: Date.now(),
			},
			null,
			2,
		)}\n`,
	);
}

function fakeCtx(pi: ReturnType<typeof fakePi>, cwd = mkdtempSync(join(tmpdir(), "goal-v2-cwd-"))): ExtensionContext {
	return {
		sessionManager: {
			getBranch: () => pi.entries,
			getCwd: () => cwd,
			getSessionId: () => "session-1",
		},
		cwd,
		hasPendingMessages: () => false,
		isIdle: () => true,
		hasUI: false,
		ui: {
			setStatus: () => {},
			setWidget: () => {},
			theme: { fg: (_name: string, text: string) => text },
		},
		modelRegistry: {
			getApiKeyAndHeaders: () => Promise.resolve({ ok: true, apiKey: "test", headers: {} }),
		},
	} as unknown as ExtensionContext;
}

// Run tests after all helpers and constants are declared.
testCoreTracksPhaseAndBlockedStatus();
await testMarkdownContextPersistsStructuredProgress();
await testDraftingFlow();
await testGoalToolsActivateOnlyAfterGoalCommand();
await testGoalToolsStayInactiveDuringLionBuild();
await testGoalToolsStayInactiveDuringFileBackedLionBuild();
await testGoalToolsActivateDuringFileBackedLionPlanning();
await testGoalToolCallBlockedWhenInactive();
await testLegacyJsonMigration();
