import type { InstructionBuilder } from "../types.js";

export const DEFAULT_BUILDER: InstructionBuilder = (ctx) =>
	`${ctx.config.name}. ${ctx.config.description}

${ctx.task.prompt}

When done, provide a concise summary of what you did.`;

export const EXECUTOR_BUILDER: InstructionBuilder = (ctx) =>
	`${ctx.config.name}. ${ctx.config.description}

${ctx.task.prompt}

Make minimal, safe changes. Run tests after each edit.
When done, summarize what you changed and why.`;

export const ANALYZER_BUILDER: InstructionBuilder = (ctx) =>
	`${ctx.config.name}. ${ctx.config.description}

${ctx.task.prompt}

Investigate thoroughly and provide a detailed analysis. Include relevant file paths and line numbers.`;

export const PLANNER_BUILDER: InstructionBuilder = (ctx) =>
	`${ctx.config.name}. ${ctx.config.description}

${ctx.task.prompt}

Produce a clear, actionable plan. Break it into ordered steps.`;

export const REVIEWER_BUILDER: InstructionBuilder = (ctx) =>
	`${ctx.config.name}. ${ctx.config.description}

${ctx.task.prompt}

Review the work against the criteria. Report issues as a bullet list.
End with "Review complete."`;
