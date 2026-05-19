import type { InstructionBuilder } from "../types.js";

export const withSummary: InstructionBuilder = (ctx) =>
	`${ctx.task.prompt}

When done, provide a concise summary of what you did.`;

export const bulletList: InstructionBuilder = (ctx) =>
	`${ctx.task.prompt}

Report your findings as a bullet list.`;

export const onlyFlagSecurity: InstructionBuilder = (ctx) =>
	`${ctx.task.prompt}

Only flag security issues. Ignore style, performance, or documentation concerns.`;

export const minimalChanges: InstructionBuilder = (ctx) =>
	`${ctx.task.prompt}

Make minimal, focused changes. Run tests after each edit.`;
