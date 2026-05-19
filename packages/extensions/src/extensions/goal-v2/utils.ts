/**
 * Utility functions for goal-v2 extension.
 */

import { formatElapsedSeconds, formatTokensCompact } from "../../shared/utils.js";
import type { Goal, GoalResponse, GoalStatus, GoalWireFormat } from "./types.js";

export const MAX_OBJECTIVE_CHARS = 4_000;

export function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

export function cloneGoal(goal: Goal): Goal {
	return { ...goal };
}

export function charCount(value: string): number {
	return [...value].length;
}

export function escapeXmlText(input: string): string {
	return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function validateObjective(input: string): string {
	const objective = input.trim();
	if (!objective) {
		throw new Error("goal objective must not be empty");
	}
	if (charCount(objective) > MAX_OBJECTIVE_CHARS) {
		throw new Error(
			`Goal objective is too long: ${charCount(objective).toLocaleString()} characters. Limit: ${MAX_OBJECTIVE_CHARS.toLocaleString()} characters. Put longer instructions in a file and refer to that file in the goal, for example: /goal follow the instructions in docs/goal.md.`,
		);
	}
	return objective;
}

export function validateTokenBudget(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error("goal budgets must be positive integers when provided");
	}
	return value;
}

export function statusLabel(status: GoalStatus): string {
	switch (status) {
		case "active":
			return "active";
		case "paused":
			return "paused";
		case "budgetLimited":
			return "limited by budget";
		case "complete":
			return "complete";
	}
}

export function assistantUsageTokens(messages: unknown[]): number {
	let total = 0;
	for (const message of messages) {
		if (!message || typeof message !== "object") continue;
		const msg = message as { role?: string; usage?: { input?: number; output?: number } };
		if (msg.role !== "assistant" || !msg.usage) continue;
		total += Math.max(0, msg.usage.input ?? 0) + Math.max(0, msg.usage.output ?? 0);
	}
	return total;
}

export function goalResponse(goal: Goal | null, sessionId: string, includeCompletionReport = false): GoalResponse {
	const wireGoal = goal ? toWireFormat(goal, sessionId) : null;
	const remainingTokens = goal?.tokenBudget === undefined ? null : Math.max(0, goal.tokenBudget - goal.tokensUsed);

	let completionBudgetReport: string | null = null;
	if (includeCompletionReport && goal?.status === "complete") {
		const parts: string[] = [];
		if (goal.tokenBudget !== undefined) parts.push(`tokens used: ${goal.tokensUsed} of ${goal.tokenBudget}`);
		if (goal.timeUsedSeconds > 0) parts.push(`time used: ${goal.timeUsedSeconds} seconds`);
		if (parts.length > 0) {
			completionBudgetReport = `Goal achieved. Report final budget usage to the user: ${parts.join("; ")}.`;
		}
	}

	return { goal: wireGoal, remainingTokens, completionBudgetReport };
}

export function toWireFormat(goal: Goal, sessionId: string): GoalWireFormat {
	return {
		threadId: sessionId,
		objective: goal.objective,
		status: goal.status,
		tokenBudget: goal.tokenBudget ?? null,
		tokensUsed: goal.tokensUsed,
		timeUsedSeconds: goal.timeUsedSeconds,
		createdAt: goal.createdAt,
		updatedAt: goal.updatedAt,
	};
}

export function goalSummary(goal: Goal): string {
	const lines = [
		"Goal",
		`Status: ${statusLabel(goal.status)}`,
		`Objective: ${goal.objective}`,
		`Time used: ${formatElapsedSeconds(goal.timeUsedSeconds)}`,
		`Tokens used: ${formatTokensCompact(goal.tokensUsed)}`,
	];
	if (goal.tokenBudget !== undefined) {
		lines.push(`Token budget: ${formatTokensCompact(goal.tokenBudget)}`);
	}
	lines.push("", commandHint(goal.status));
	return lines.join("\n");
}

export function commandHint(status: GoalStatus): string {
	switch (status) {
		case "active":
			return "Commands: /goal pause, /goal clear";
		case "paused":
			return "Commands: /goal resume, /goal clear";
		case "budgetLimited":
		case "complete":
			return "Commands: /goal clear";
	}
}
