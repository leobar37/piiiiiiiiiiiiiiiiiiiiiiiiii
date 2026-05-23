/**
 * JSON storage and tracking helpers for goal-v2 context.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
	AppendGoalIterationInput,
	CreateGoalContextInput,
	Goal,
	GoalContextDocument,
	GoalContextIteration,
} from "./types.js";
import { nowSeconds } from "./utils.js";

const GOAL_CONTEXT_VERSION = 1;

function unique(values: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
}

function assertStringArray(value: unknown, field: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error(`invalid goal context ${field}: expected string array`);
	}
	return value;
}

function parseGoalContextDocument(raw: string, path: string): GoalContextDocument {
	const parsed = JSON.parse(raw) as unknown;
	if (!parsed || typeof parsed !== "object") {
		throw new Error(`invalid goal context document at ${path}`);
	}
	const doc = parsed as GoalContextDocument;
	if (
		doc.version !== GOAL_CONTEXT_VERSION ||
		typeof doc.sessionId !== "string" ||
		typeof doc.goalId !== "string" ||
		typeof doc.cwd !== "string" ||
		typeof doc.originalObjective !== "string" ||
		!(typeof doc.clarifiedObjective === "string" || doc.clarifiedObjective === null) ||
		typeof doc.createdAt !== "number" ||
		typeof doc.updatedAt !== "number"
	) {
		throw new Error(`invalid goal context document shape at ${path}`);
	}
	assertStringArray(doc.successCriteria, "successCriteria");
	assertStringArray(doc.relevantFiles, "relevantFiles");
	assertStringArray(doc.constraints, "constraints");
	assertStringArray(doc.notes, "notes");
	if (!Array.isArray(doc.iterations)) {
		throw new Error(`invalid goal context iterations at ${path}`);
	}
	return doc;
}

export class GoalContextStore {
	constructor(private readonly cwd: string) {}

	getPath(sessionId: string, goalId: string): string {
		return join(this.cwd, ".pi", "goals", sessionId, `${goalId}-context.json`);
	}

	async exists(sessionId: string, goalId: string): Promise<boolean> {
		return (await this.read(sessionId, goalId)) !== null;
	}

	async create(input: CreateGoalContextInput): Promise<GoalContextDocument> {
		const ts = nowSeconds();
		const doc: GoalContextDocument = {
			version: GOAL_CONTEXT_VERSION,
			sessionId: input.sessionId,
			goalId: input.goalId,
			cwd: this.cwd,
			originalObjective: input.originalObjective,
			clarifiedObjective: input.clarifiedObjective ?? null,
			successCriteria: unique(input.successCriteria ?? []),
			relevantFiles: unique(input.relevantFiles ?? []),
			constraints: unique(input.constraints ?? []),
			notes: unique(input.notes ?? []),
			iterations: [
				this.createIteration({
					kind: "context",
					summary: "Goal context initialized",
					details: input.originalObjective,
				}),
			],
			createdAt: ts,
			updatedAt: ts,
		};
		await this.write(doc);
		return doc;
	}

	async read(sessionId: string, goalId: string): Promise<GoalContextDocument | null> {
		const path = this.getPath(sessionId, goalId);
		try {
			return parseGoalContextDocument(await readFile(path, "utf8"), path);
		} catch (err) {
			if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
				return null;
			}
			throw err;
		}
	}

	async require(sessionId: string, goalId: string): Promise<GoalContextDocument> {
		const doc = await this.read(sessionId, goalId);
		if (!doc) {
			throw new Error(`goal context does not exist: ${this.getPath(sessionId, goalId)}`);
		}
		return doc;
	}

	async update(
		sessionId: string,
		goalId: string,
		updater: (doc: GoalContextDocument) => GoalContextDocument,
	): Promise<GoalContextDocument> {
		const current = await this.require(sessionId, goalId);
		const updated = updater({ ...current });
		updated.updatedAt = nowSeconds();
		await this.write(updated);
		return updated;
	}

	async appendIteration(
		sessionId: string,
		goalId: string,
		iteration: AppendGoalIterationInput,
	): Promise<GoalContextDocument> {
		return this.update(sessionId, goalId, (doc) => ({
			...doc,
			iterations: [...doc.iterations, this.createIteration(iteration)],
		}));
	}

	async setClarifiedObjective(sessionId: string, goalId: string, objective: string): Promise<GoalContextDocument> {
		return this.update(sessionId, goalId, (doc) => ({ ...doc, clarifiedObjective: objective.trim() || null }));
	}

	async addSuccessCriteria(sessionId: string, goalId: string, criteria: string[]): Promise<GoalContextDocument> {
		return this.update(sessionId, goalId, (doc) => ({
			...doc,
			successCriteria: unique([...doc.successCriteria, ...criteria]),
		}));
	}

	async addRelevantFiles(sessionId: string, goalId: string, files: string[]): Promise<GoalContextDocument> {
		return this.update(sessionId, goalId, (doc) => ({
			...doc,
			relevantFiles: unique([...doc.relevantFiles, ...files]),
		}));
	}

	async addConstraints(sessionId: string, goalId: string, constraints: string[]): Promise<GoalContextDocument> {
		return this.update(sessionId, goalId, (doc) => ({
			...doc,
			constraints: unique([...doc.constraints, ...constraints]),
		}));
	}

	async addNote(sessionId: string, goalId: string, note: string): Promise<GoalContextDocument> {
		return this.update(sessionId, goalId, (doc) => ({ ...doc, notes: unique([...doc.notes, note]) }));
	}

	private createIteration(input: AppendGoalIterationInput): GoalContextIteration {
		return {
			id: randomUUID(),
			kind: input.kind,
			summary: input.summary.trim(),
			details: input.details?.trim() || undefined,
			evidence: unique(input.evidence ?? []),
			createdAt: nowSeconds(),
		};
	}

	private async write(doc: GoalContextDocument): Promise<void> {
		const path = this.getPath(doc.sessionId, doc.goalId);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
	}
}

export class GoalContextTracker {
	private readonly store: GoalContextStore;
	private readonly sessionId: string;

	constructor(cwd: string, sessionId: string) {
		this.store = new GoalContextStore(cwd);
		this.sessionId = sessionId;
	}

	getPath(goalId: string): string {
		return this.store.getPath(this.sessionId, goalId);
	}

	async initialize(goal: Goal): Promise<string> {
		const existing = await this.store.read(this.sessionId, goal.id);
		if (!existing) {
			await this.store.create({
				sessionId: this.sessionId,
				goalId: goal.id,
				originalObjective: goal.objective,
			});
		}
		return this.getPath(goal.id);
	}

	async record(goal: Goal, iteration: AppendGoalIterationInput): Promise<void> {
		await this.ensure(goal);
		await this.store.appendIteration(this.sessionId, goal.id, iteration);
	}

	async recordStatus(goal: Goal, summary: string): Promise<void> {
		await this.record(goal, { kind: "status", summary });
	}

	async recordWork(goal: Goal, summary: string, details?: string): Promise<void> {
		await this.record(goal, { kind: "work", summary, details });
	}

	async recordCompletion(goal: Goal): Promise<void> {
		await this.record(goal, {
			kind: "completion",
			summary: "Goal marked complete",
			details: `Elapsed time: ${goal.timeUsedSeconds} seconds`,
		});
	}

	private async ensure(goal: Goal): Promise<void> {
		if (!(await this.store.exists(this.sessionId, goal.id))) {
			await this.store.create({
				sessionId: this.sessionId,
				goalId: goal.id,
				originalObjective: goal.objective,
			});
		}
	}
}
