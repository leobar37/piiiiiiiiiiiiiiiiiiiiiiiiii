/**
 * Core types for goal-v2 extension.
 */

export type GoalStatus = "active" | "paused" | "blocked" | "complete";

export type GoalPhase = "context_gathering" | "executing" | "verifying" | "blocked" | "complete";

export type GoalMode = "idle" | "drafting" | "active" | "auditing";

export interface Goal {
	id: string;
	objective: string;
	status: GoalStatus;
	phase: GoalPhase;
	timeUsedSeconds: number;
	blockerReason?: string;
	contextPath?: string;
	createdAt: number;
	updatedAt: number;
}

export interface GoalDraft {
	id: string;
	originalObjective: string;
	clarifiedObjective?: string;
	successCriteria: string[];
	relevantFiles: string[];
	constraints: string[];
	notes: string[];
	createdAt: number;
}

export interface PersistedGoalState {
	version: 3;
	action: "set" | "status" | "clear" | "account";
	goal: Goal | null;
	draft: GoalDraft | null;
	mode: GoalMode;
}

export interface LegacyPersistedGoalState {
	version: 2;
	action: "set" | "status" | "clear" | "account";
	goal: Goal | null;
}

export interface GoalWireFormat {
	threadId: string;
	objective: string;
	status: GoalStatus;
	phase: GoalPhase;
	timeUsedSeconds: number;
	blockerReason: string | null;
	contextPath: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface GoalResponse {
	goal: GoalWireFormat | null;
}

export type GoalContextIterationKind =
	| "context"
	| "plan"
	| "work"
	| "verification"
	| "blocker"
	| "decision"
	| "status"
	| "completion";

export interface GoalContextIteration {
	id: string;
	kind: GoalContextIterationKind;
	summary: string;
	details?: string;
	evidence: string[];
	createdAt: number;
}

export interface GoalContextDocument {
	version: 1;
	sessionId: string;
	goalId: string;
	cwd: string;
	originalObjective: string;
	clarifiedObjective: string | null;
	successCriteria: string[];
	relevantFiles: string[];
	constraints: string[];
	blockers: string[];
	notes: string[];
	iterations: GoalContextIteration[];
	createdAt: number;
	updatedAt: number;
}

export interface CreateGoalContextInput {
	sessionId: string;
	goalId: string;
	originalObjective: string;
	clarifiedObjective?: string | null;
	successCriteria?: string[];
	relevantFiles?: string[];
	constraints?: string[];
	blockers?: string[];
	notes?: string[];
}

export interface AppendGoalIterationInput {
	kind: GoalContextIterationKind;
	summary: string;
	details?: string;
	evidence?: string[];
}
