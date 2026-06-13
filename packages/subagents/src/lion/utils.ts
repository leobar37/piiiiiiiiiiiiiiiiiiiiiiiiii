import { basename, relative } from "node:path";
import type { LionBuildResult, LionPlan, LionReviewVerdict, LionState, LionTaskStatus } from "./types.js";

export function slugFromPath(path: string): string {
	return basename(path.replace(/\/$/, ""));
}

export function normalizeTaskStatus(status: unknown): LionTaskStatus {
	switch (status) {
		case "complete":
		case "completed":
			return "complete";
		case "in_progress":
		case "in-progress":
		case "running":
			return "in_progress";
		case "blocked":
			return "blocked";
		case "retryable":
			return "retryable";
		default:
			return "pending";
	}
}

export function parseReviewVerdict(summary: string): LionReviewVerdict {
	const lines = summary
		.split(/\r?\n/)
		.map((line) => line.trim().toLowerCase())
		.filter(Boolean);
	if (lines.includes("lion_review_status: approved")) return "approved";
	if (lines.includes("lion_review_status: rejected")) return "rejected";
	if (lines.some((line) => line.includes("<lion-approve>"))) return "approved";
	if (lines.some((line) => line.includes("<lion-rejected>"))) return "rejected";
	return "unknown";
}

export function formatPlanSummary(plan: LionPlan): string {
	const complete = plan.tasks.filter((task) => task.status === "complete").length;
	const pending = plan.tasks.filter((task) => task.status === "pending").length;
	const blocked = plan.tasks.filter((task) => task.status === "blocked").length;
	const retryable = plan.tasks.filter((task) => task.status === "retryable").length;
	return [
		`Plan: ${plan.slug}`,
		`Kind: ${plan.kind}`,
		`Path: ${plan.rootPath}`,
		`Tasks: ${complete}/${plan.tasks.length} complete, ${pending} pending, ${retryable} retryable, ${blocked} blocked`,
	].join("\n");
}

export function formatBuildResult(result: LionBuildResult): string {
	const lines = [`Task: ${result.taskId}`, `Status: ${result.status}`, `Attempts: ${result.attempts}`];
	if (result.executorSummary) lines.push("", "Executor summary:", result.executorSummary);
	if (result.reviewerSummary) lines.push("", "Reviewer summary:", result.reviewerSummary);
	if (result.error) lines.push("", `Error: ${result.error}`);
	return lines.join("\n");
}

export function relativeDisplayPath(cwd: string, path: string): string {
	const rel = relative(cwd, path);
	return rel.startsWith("..") ? path : rel;
}

import { randomUUID } from "node:crypto";

export function createRunId(): string {
	return `lion-${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

/**
 * Normalizes a restored Lion state to ensure inactive sessions use strategy "none".
 * This handles migration from older states where inactive sessions defaulted to "plan".
 */
export function normalizeInactiveStrategy(state: LionState): LionState {
	if (!state.active && state.strategy !== "none") {
		return { ...state, strategy: "none" };
	}
	return state;
}
