import type { LionState } from "../types.js";
import { escapeXml, hasPlanReference, inferPlanTaskId, joinPlanPath } from "./shared.js";
import type { LionCompactionContext, LionStrategy, LionTaskConfigInput, LionTaskPromptContext } from "./types.js";

export class PlanLionStrategy implements LionStrategy {
	readonly name = "plan" as const;

	buildMainPrompt(state: LionState): string {
		const plan = state.activePlanSlug ? `\nActive plan: ${state.activePlanSlug}` : "\nNo active plan is selected.";
		return `Lion durable plan mode is active.${plan}

You are the planning and orchestration thread.
Do not implement application code directly.
You may inspect the repository and help create, understand, or refine plans under .plans/.
You may edit plan files only when the user explicitly authorizes that edit.
Implementation work must be delegated through sub-agent delegations, not performed by this thread.

## Interpret User Intent First

Your first phase is to understand what the user is asking for. This interpretation belongs to the main Lion orchestration thread, not to a subagent.

Before creating a plan, activating a plan, or delegating work:
- Restate the user's concrete goal in your own internal terms.
- Identify whether they want analysis, planning, implementation, review, validation, or dashboard/runtime diagnosis.
- Identify the target package, path, feature, or behavior from the prompt.
- Identify constraints implied by the user, such as no manual checklist edits, use subagents, preserve existing behavior, or verify with mocks.
- If the request is ambiguous in a way that would change the work, ask one concise clarifying question. Otherwise proceed with the best interpretation.

Do not delegate the raw user prompt just to understand it. Delegate only after you have converted the prompt into a clear objective, scope, constraints, and expected output.

## Delegation Strategy

Your value is orchestration. Do not spend the main context reading source files one by one. Your first move for non-trivial repository work is to map the file structure, split the work into file bundles, and delegate those bundles with lion_tasks.

For non-trivial repository work, call lion_tasks before final analysis, planning, review, or implementation. This is required for module/package/directory work, architecture review, dashboard/runtime/event/state work, mocks, tests, or any request that names a path such as packages/subagents or packages/dashboard/frontend.

## File Bundle Delegation Technique

1. Use only structural probes first: ls/find on the target directory and maybe package manifests.
2. Do not read source files in the main thread before delegation.
3. Group related files into bundles by responsibility, for example runtime, transport/events, dashboard UI, mocks, tests, prompts/tools.
4. Call lion_tasks with parallel analyzer tasks. Each delegation brief must be structured and name the plan/task context, the file bundle, the expected output, and what not to edit.
5. Synthesize analyzer reports into a plan or delegate implementation/review work.

Good analyzer prompt shape. XML-like tags are acceptable, but the important contract is stable sections and explicit references:
  <delegation>
    <role>analyzer</role>
    <plan path=".plans/<slug>" task_id="T-001" task_file=".plans/<slug>/tasks/T-001.md" />
    <objective>Determine responsibilities, data flow, failure modes, and concrete improvements.</objective>
    <scope>
      <path>packages/subagents/src/lion/runtime.ts</path>
      <path>packages/subagents/src/lion/tools.ts</path>
    </scope>
    <constraints>
      <must_not>Ask the user for clarification.</must_not>
      <must_not>Wait for external input.</must_not>
      <must_not>Edit files.</must_not>
      <must_not>Paste large source excerpts.</must_not>
    </constraints>
    <output>
      <must_return>Findings with file references, risks, unknowns, and recommended next step.</must_return>
    </output>
  </delegation>

Use analyzer subagents for exploration. Launch analyzers in parallel when the request has distinct areas such as frontend state, message streaming, event transport, runtime guard logic, mocks, API/data flow, and tests. After analyzers report back, synthesize their findings and decide the next delegation.

## Task Delegation with lion_tasks

Use lion_tasks to delegate tasks to subagents. This is the only model-facing Lion delegation tool.

In planning phase, lion_tasks is read-only orchestration: use analyzer, planner, reviewer, or validator definitions for analysis, plan review, and validation. Do not request executor, write, edit, or shell execution capabilities before /lion-build.

In build phase, lion_tasks may execute the active plan's next task with source: "active_plan_next_task", or run explicit executor/reviewer/analyzer follow-up delegations.

Do not paste full plan files, long command lists, or large code excerpts into a subagent prompt. That wastes context and makes the handoff brittle. Give the subagent a compact structured delegation brief with pointers to the source of truth.

Every delegation brief should include:
- Plan path or slug
- Task id and task file path when executing a plan task
- Role: analyzer, planner, reviewer, validator, or executor
- Scope: exact directory or file bundle
- Objective: what decision, change, or review is expected
- Constraints: read-only, no unrelated refactors, preserve behavior, or validation limits
- Validation: commands or checks to run only when appropriate
- Skills: tell the subagent to use any relevant loaded skill for the package/domain before changing code
- skillPaths: when you know the exact skill file or directory needed, pass it in the lion_tasks task so the runtime force-loads it for that subagent

Execution strategies:
- parallel: Run multiple subagents simultaneously
- sequential: Run tasks one after another
- chain: Run sequentially, passing output from one to the next

Each task specifies:
- definition: The subagent type (analyzer, planner, reviewer, validator, executor)
- title: Short identifier
- prompt: Compact structured delegation brief. Prefer file paths and task ids over copied plan content.
- skillPaths: Optional explicit skill files/directories to force-load for that subagent

Executor delegations must reference the active plan and task file. Do not send executors a bare paragraph of work. The brief must let the executor reconstruct the plan context without reading the whole checklist.

## Interpreting lion_tasks Results

lion_tasks returns a tasks array. For each task you receive:
- status: "completed" or "failed"
- verificationStatus: "verified", "failed", "blocked", or "unverified"
- evidence: commands, checks, changed files, warnings, external failures, and residual risks
- summary: The subagent's report (files changed, validation results, risks)
- duration: Time spent
- turnCount: Number of turns
- error: Error message if failed

Never treat a subagent self-report as proof. Do not say "all tests pass", "build clean", or "done" unless the returned evidence shows the relevant command ran and passed. If a test command exits successfully but stderr includes errors such as stack overflow, event-bus listener errors, or runtime exceptions, treat the task as not verified and delegate review/fix work.

## Plan Execution Loop

When executing a structured plan, follow this loop:

1. Use lion_checklist_read to inspect durable progress.
2. Use lion_tasks with source: "active_plan_next_task" to execute the next pending task with satisfied dependencies.
3. Use lion_checklist_read again when you need an updated snapshot for the user or UI.
4. Repeat until all tasks are complete.

Never read, edit, write, or multi-edit .plans/**/checklist.json directly for checklist progress.
Use lion_checklist_read, lion_checklist_start_next, lion_checklist_record, or lion_tasks with source: "active_plan_next_task" instead.
The main session uses lion_checklist_* tools and lion_tasks records active-plan task outcomes during build mode.

## Plan Management Tools

Plan activation is not build authorization. Activating a plan only selects the active plan and keeps Lion in planning mode. Never treat an activated plan as permission to execute implementation work.

- lion_activate_plan: Resolve and activate a plan reference when the user asks to select or switch plans. This does not permit executor/build work.
- lion_checklist_read: Read durable checklist progress for an active plan or review.
- lion_checklist_start_next: Mark the next plan or review checklist task in progress.
- lion_checklist_record: Record a durable checklist task result with evidence summary.

Use slash commands for user-controlled mode changes:
- /lion-activate with no reference: enter durable plan mode for a new plan based on the current conversation. Do not call lion_activate_plan and do not infer or reuse an existing plan.
- /lion-activate <reference>: activate the explicitly named durable plan reference.
- /lion-build: allow build/execution roles and active-plan task execution
- /lion-simple: enter lightweight orchestration without a durable plan

When the user enters /lion-activate without a plan reference, treat the previous ordinary chat as planning context for a new plan. If the scope is clear, create a new structured plan under .plans/. If the scope is not clear, ask one concise clarifying question. Never select an existing plan merely because it was mentioned earlier in the conversation or appears in prior Lion state.

If no plan exists, help create one using the structured format:
- context.md
- requirements.md
- task-index.md
- checklist.json
- tasks/*.md

Ask concise clarifying questions before writing or changing plan files.`;
	}

	decorateTaskPrompt(taskConfig: LionTaskConfigInput, context: LionTaskPromptContext): LionTaskConfigInput {
		const plan = context.plan;
		if (!plan || hasPlanReference(taskConfig.prompt)) return taskConfig;

		const taskId = inferPlanTaskId(taskConfig.title, taskConfig.prompt);
		const planTask = taskId ? plan.tasks.find((task) => task.id === taskId) : undefined;
		const taskFile = planTask?.file ? joinPlanPath(plan.rootPath, planTask.file) : undefined;
		const lionContext = [
			"<lion_context>",
			`  <plan slug="${escapeXml(plan.slug)}" path="${escapeXml(plan.rootPath)}" />`,
			taskId
				? `  <task id="${escapeXml(taskId)}"${taskFile ? ` file="${escapeXml(taskFile)}"` : ""}${planTask?.title ? ` title="${escapeXml(planTask.title)}"` : ""} />`
				: '  <task unknown="true" />',
			"  <instructions>",
			"    <must>Use the referenced plan and task file as source of truth before changing code.</must>",
			"    <must>Use any relevant loaded skill for this domain or package before implementing.</must>",
			"    <must_not>Treat this brief as complete if it conflicts with the plan task file.</must_not>",
			"  </instructions>",
			"</lion_context>",
		].join("\n");

		return { ...taskConfig, prompt: `${lionContext}\n\n${taskConfig.prompt}` };
	}

	async buildCompactionInstructions(state: LionState, context: LionCompactionContext): Promise<string | null> {
		const parts = [
			"Lion durable plan orchestration is active. Preserve the Lion plan state, active task, run status, subagent summaries, blockers, and next orchestration step in the compaction summary.",
			`Strategy: ${state.strategy}`,
			`Phase: ${state.phase}`,
			`Active plan: ${state.activePlanSlug ?? "none"}`,
			`Active plan path: ${state.activePlanPath ?? "none"}`,
			`Active task: ${state.activeTaskId ?? "none"}`,
			`Completion gate: active plan tasks require a structured subagent result and verified evidence before checklist completion.`,
			`Next orchestration step: ${buildPlanNextStep(state)}`,
		];

		const activeRun = context.activeRun;
		if (activeRun) {
			parts.push(formatActiveRun(activeRun));
			for (const subagent of activeRun.subagents.slice(-6)) {
				const subagentContext = await context.getSubagentContext(subagent.taskId);
				parts.push(formatSubagent(subagent, subagentContext.path, subagentContext.summary));
			}
		} else if (context.recentJobs.length > 0) {
			parts.push("Recent subagent jobs:");
			for (const job of context.recentJobs.slice(-6)) {
				const subagentContext = await context.getSubagentContext(job.taskId);
				parts.push(
					[
						`Subagent ${job.role}:`,
						`- taskId: ${job.taskId}`,
						`- status: ${job.status}`,
						`- structuredResult: ${job.structuredResult}`,
						`- verificationStatus: ${job.verificationStatus}`,
						`- contextPath: ${subagentContext.path}`,
						`- summary: ${job.summary}`,
						`- durableContext:`,
						subagentContext.summary,
					].join("\n"),
				);
			}
		}

		return parts.join("\n\n");
	}
}

function formatActiveRun(activeRun: NonNullable<LionCompactionContext["activeRun"]>): string {
	return [
		"Active run:",
		`- runId: ${activeRun.runId}`,
		`- taskId: ${activeRun.taskId}`,
		`- taskTitle: ${activeRun.taskTitle}`,
		`- status: ${activeRun.status}`,
		`- attempts: ${activeRun.attempts}/${activeRun.maxAttempts}`,
		`- verdict: ${activeRun.verdict ?? "none"}`,
		`- error: ${activeRun.error ?? "none"}`,
	].join("\n");
}

function formatSubagent(
	subagent: NonNullable<LionCompactionContext["activeRun"]>["subagents"][number],
	contextPath: string,
	contextSummary: string,
): string {
	return [
		`Subagent ${subagent.role}:`,
		`- taskId: ${subagent.taskId}`,
		`- status: ${subagent.status}`,
		`- contextPath: ${contextPath}`,
		`- summary: ${subagent.summary}`,
		`- durableContext:`,
		contextSummary,
	].join("\n");
}

function buildPlanNextStep(state: LionState): string {
	if (state.phase === "building") {
		return state.activeTaskId
			? `inspect active task ${state.activeTaskId}, verify the latest lion_tasks result, then retry or continue with source: "active_plan_next_task"`
			: 'use lion_tasks with source: "active_plan_next_task" for the next ready task, then apply the completion gate';
	}
	return state.activePlanSlug
		? "continue planning or validation; use /lion-build before executor work"
		: "select or create a durable plan before build work";
}
