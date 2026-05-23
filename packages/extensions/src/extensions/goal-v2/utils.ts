/**
 * Utility functions for goal-v2 extension.
 */

import { formatElapsedSeconds } from "../../shared/utils.js";
import type { Goal, GoalResponse, GoalStatus, GoalWireFormat } from "./types.js";

export const MAX_OBJECTIVE_CHARS = 4_000;

export function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

export function cloneGoal(goal: Goal): Goal {
	return {
		id: goal.id,
		objective: goal.objective,
		status: goal.status,
		timeUsedSeconds: goal.timeUsedSeconds,
		contextPath: goal.contextPath,
		createdAt: goal.createdAt,
		updatedAt: goal.updatedAt,
	};
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

export function statusLabel(status: GoalStatus): string {
	switch (status) {
		case "active":
			return "active";
		case "paused":
			return "paused";
		case "complete":
			return "complete";
	}
}

export function goalResponse(goal: Goal | null, sessionId: string): GoalResponse {
	const wireGoal = goal ? toWireFormat(goal, sessionId) : null;
	return { goal: wireGoal };
}

export function toWireFormat(goal: Goal, sessionId: string): GoalWireFormat {
	return {
		threadId: sessionId,
		objective: goal.objective,
		status: goal.status,
		timeUsedSeconds: goal.timeUsedSeconds,
		contextPath: goal.contextPath ?? null,
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
	];
	if (goal.contextPath) {
		lines.push(`Context: ${goal.contextPath}`);
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
		case "complete":
			return "Commands: /goal clear";
	}
}
