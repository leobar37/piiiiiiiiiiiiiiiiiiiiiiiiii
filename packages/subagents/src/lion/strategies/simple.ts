import type { LionState } from "../types.js";
import { escapeXml } from "./shared.js";
import type { LionCompactionContext, LionStrategy, LionTaskConfigInput, LionTaskPromptContext } from "./types.js";

export class SimpleLionStrategy implements LionStrategy {
	readonly name = "simple" as const;

	buildMainPrompt(_state: LionState): string {
		return `Lion simple mode is active.

You are the lightweight orchestration thread.
Do not create, activate, or require a durable plan unless the user explicitly asks to switch to plan mode.
Use subagents for useful parallel analysis, implementation, review, or validation without plan ceremony.

## Operating Rules

- Interpret the user's concrete goal before delegating.
- Use lion_tasks for non-trivial repository work when subagents would reduce main-thread context pressure.
- Keep delegation briefs compact and structured.
- Scope each delegation with exact files, directories, objective, constraints, and expected output.
- Do not assume active-plan task execution unless an active durable plan exists and /lion-build has been used.
- Do not claim verification without concrete evidence from commands or explicit checks.
- If the task becomes long-running, risky, or needs durable tracking, recommend switching to plan mode and wait for user approval.

## Simple Delegation Pattern

For analysis. XML-like tags are acceptable, but stable sections and explicit references matter more than XML validity:
  <delegation>
    <role>analyzer</role>
    <objective>Investigate the scoped behavior and return findings.</objective>
    <scope>
      <path>packages/example</path>
    </scope>
    <constraints>
      <must_not>Edit files.</must_not>
      <must_not>Ask the user for clarification.</must_not>
    </constraints>
    <output>
      <must_return>Findings, files inspected, risks, unknowns, and recommended next step.</must_return>
    </output>
  </delegation>

For implementation:
  <delegation>
    <role>executor</role>
    <objective>Implement the requested bounded change.</objective>
    <scope>
      <path>packages/example</path>
    </scope>
    <constraints>
      <must_not>Make unrelated refactors.</must_not>
      <must_not>Ask the user for clarification.</must_not>
    </constraints>
    <output>
      <must_return>Files changed, validation run, result, risks, and unknowns.</must_return>
    </output>
  </delegation>`;
	}

	decorateTaskPrompt(taskConfig: LionTaskConfigInput, _context: LionTaskPromptContext): LionTaskConfigInput {
		if (taskConfig.prompt.includes("</lion_context>")) return taskConfig;
		const lionContext = [
			'<lion_context mode="simple">',
			"  <instructions>",
			"    <must>Use the delegated scope and referenced files as source of truth.</must>",
			"    <must>Use any relevant loaded skill for this domain or package before changing code.</must>",
			"    <must_not>Assume a durable plan or plan task file exists.</must_not>",
			"    <must_not>Create or edit plan files unless explicitly requested by the user.</must_not>",
			"  </instructions>",
			taskConfig.title ? `  <task title="${escapeXml(taskConfig.title)}" />` : "",
			"</lion_context>",
		]
			.filter(Boolean)
			.join("\n");

		return { ...taskConfig, prompt: `${lionContext}\n\n${taskConfig.prompt}` };
	}

	async buildCompactionInstructions(state: LionState, context: LionCompactionContext): Promise<string | null> {
		const parts = [
			"Lion simple orchestration is active. Preserve the user objective, delegated subagent work, decisions, blockers, evidence, relevant files, and next lightweight orchestration step in the compaction summary.",
			`Strategy: ${state.strategy}`,
			`Phase: ${state.phase}`,
			"Active plan: none",
			"Completion gate: use structured subagent results and verified evidence before claiming completion.",
			"Next orchestration step: inspect recent delegated work, resolve blockers or unverified results, then continue with lion_tasks if needed.",
		];

		const activeRun = context.activeRun;
		if (activeRun) {
			parts.push(
				[
					"Active simple run:",
					`- runId: ${activeRun.runId}`,
					`- taskId: ${activeRun.taskId}`,
					`- taskTitle: ${activeRun.taskTitle}`,
					`- status: ${activeRun.status}`,
					`- error: ${activeRun.error ?? "none"}`,
				].join("\n"),
			);
			for (const subagent of activeRun.subagents.slice(-6)) {
				const subagentContext = await context.getSubagentContext(subagent.taskId);
				parts.push(
					[
						`Subagent ${subagent.role}:`,
						`- taskId: ${subagent.taskId}`,
						`- status: ${subagent.status}`,
						`- contextPath: ${subagentContext.path}`,
						`- summary: ${subagent.summary}`,
						`- durableContext:`,
						subagentContext.summary,
					].join("\n"),
				);
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
