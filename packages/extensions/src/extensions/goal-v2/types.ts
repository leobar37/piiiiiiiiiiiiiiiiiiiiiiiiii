/**
 * Core types for goal-v2 extension.
 */

export type GoalStatus = "active" | "paused" | "budgetLimited" | "complete";

export interface Goal {
	id: string;
	objective: string;
	status: GoalStatus;
	tokenBudget?: number;
	tokensUsed: number;
	timeUsedSeconds: number;
	createdAt: number;
	updatedAt: number;
}

export interface PersistedGoalState {
	version: 2;
	action: "set" | "status" | "clear" | "account";
	goal: Goal | null;
}

export interface GoalWireFormat {
	threadId: string;
	objective: string;
	status: GoalStatus;
	tokenBudget: number | null;
	tokensUsed: number;
	timeUsedSeconds: number;
	createdAt: number;
	updatedAt: number;
}

export interface GoalResponse {
	goal: GoalWireFormat | null;
	remainingTokens: number | null;
	completionBudgetReport: string | null;
}
