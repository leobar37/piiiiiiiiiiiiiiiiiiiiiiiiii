/**
 * Markdown storage and tracking helpers for goal-v2 context.
 *
 * Each goal is persisted as a single markdown file:
 *   .pi/goals/active_goal_<id>.md
 *
 * The file contains a JSON front-matter block with structured state,
 * followed by human-readable markdown sections. The markdown body is
 * regenerated from the front matter on every write.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { AppendGoalIterationInput, CreateGoalContextInput, Goal, GoalContextIteration } from "./types.js";
import { formatDateTime, nowSeconds, unique } from "./utils.js";

const GOAL_CONTEXT_VERSION = 2;
const ACTIVE_PREFIX = "active_goal_";
const ARCHIVE_DIR = "archived";

function safeFilenamePart(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function goalFilename(goalId: string): string {
	return `${ACTIVE_PREFIX}${safeFilenamePart(goalId)}.md`;
}

function archivedGoalFilename(goalId: string, timestampSeconds: number): string {
	return `goal_${timestampSeconds}_${safeFilenamePart(goalId)}.md`;
}

function assertStringArray(value: unknown, field: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error(`invalid goal context ${field}: expected string array`);
	}
	return value;
}

function assertString(value: unknown, field: string): string {
	if (typeof value !== "string") {
		throw new Error(`invalid goal context ${field}: expected string`);
	}
	return value;
}

function assertNumber(value: unknown, field: string): number {
	if (typeof value !== "number") {
		throw new Error(`invalid goal context ${field}: expected number`);
	}
	return value;
}

function parseIteration(value: unknown): GoalContextIteration {
	if (!value || typeof value !== "object") {
		throw new Error("invalid goal context iteration: expected object");
	}
	const record = value as Record<string, unknown>;
	return {
		id: assertString(record.id, "iteration.id"),
		kind: assertString(record.kind, "iteration.kind") as GoalContextIteration["kind"],
		summary: assertString(record.summary, "iteration.summary"),
		details: typeof record.details === "string" ? record.details : undefined,
		evidence: assertStringArray(record.evidence ?? [], "iteration.evidence"),
		createdAt: assertNumber(record.createdAt, "iteration.createdAt"),
	};
}

export interface GoalFileDocument {
	version: number;
	id: string;
	sessionId: string;
	cwd: string;
	originalObjective: string;
	clarifiedObjective: string | null;
	status: Goal["status"];
	phase: Goal["phase"];
	timeUsedSeconds: number;
	successCriteria: string[];
	relevantFiles: string[];
	constraints: string[];
	blockers: string[];
	notes: string[];
	iterations: GoalContextIteration[];
	createdAt: number;
	updatedAt: number;
}

function parseFrontMatter(raw: string): Record<string, unknown> {
	const trimmed = raw.trimStart();
	if (!trimmed.startsWith("---\n")) {
		throw new Error("missing front matter delimiter");
	}
	const end = trimmed.indexOf("\n---", 4);
	if (end === -1) {
		throw new Error("unterminated front matter block");
	}
	const json = trimmed.slice(4, end).trim();
	const parsed = JSON.parse(json) as unknown;
	if (!parsed || typeof parsed !== "object") {
		throw new Error("front matter is not a JSON object");
	}
	return parsed as Record<string, unknown>;
}

function parseGoalFileDocument(raw: string, path: string): GoalFileDocument {
	try {
		const front = parseFrontMatter(raw);
		return {
			version: assertNumber(front.version, "version"),
			id: assertString(front.id, "id"),
			sessionId: assertString(front.sessionId, "sessionId"),
			cwd: assertString(front.cwd, "cwd"),
			originalObjective: assertString(front.originalObjective, "originalObjective"),
			clarifiedObjective: typeof front.clarifiedObjective === "string" ? front.clarifiedObjective : null,
			status: assertString(front.status, "status") as Goal["status"],
			phase: assertString(front.phase, "phase") as Goal["phase"],
			timeUsedSeconds: assertNumber(front.timeUsedSeconds, "timeUsedSeconds"),
			successCriteria: assertStringArray(front.successCriteria ?? [], "successCriteria"),
			relevantFiles: assertStringArray(front.relevantFiles ?? [], "relevantFiles"),
			constraints: assertStringArray(front.constraints ?? [], "constraints"),
			blockers: assertStringArray(front.blockers ?? [], "blockers"),
			notes: assertStringArray(front.notes ?? [], "notes"),
			iterations: Array.isArray(front.iterations) ? front.iterations.map(parseIteration) : [],
			createdAt: assertNumber(front.createdAt, "createdAt"),
			updatedAt: assertNumber(front.updatedAt, "updatedAt"),
		};
	} catch (error) {
		throw new Error(
			`invalid goal markdown file at ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function escapeMarkdown(text: string): string {
	return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function renderProgressItem(iteration: GoalContextIteration): string {
	const lines: string[] = [
		`- **${iteration.kind}** — ${escapeMarkdown(iteration.summary)}`,
		`  - *${formatDateTime(iteration.createdAt)}*`,
	];
	if (iteration.details) {
		for (const line of iteration.details.split("\n")) {
			lines.push(`  - ${escapeMarkdown(line)}`);
		}
	}
	if (iteration.evidence.length > 0) {
		lines.push(`  - Evidence: ${iteration.evidence.map(escapeMarkdown).join(", ")}`);
	}
	return lines.join("\n");
}

function serializeGoalFileDocument(doc: GoalFileDocument): string {
	const front = {
		version: doc.version,
		id: doc.id,
		sessionId: doc.sessionId,
		cwd: doc.cwd,
		originalObjective: doc.originalObjective,
		clarifiedObjective: doc.clarifiedObjective,
		status: doc.status,
		phase: doc.phase,
		timeUsedSeconds: doc.timeUsedSeconds,
		successCriteria: doc.successCriteria,
		relevantFiles: doc.relevantFiles,
		constraints: doc.constraints,
		blockers: doc.blockers,
		notes: doc.notes,
		iterations: doc.iterations,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
	};

	const objective = escapeMarkdown(doc.originalObjective);
	const clarified = doc.clarifiedObjective ? escapeMarkdown(doc.clarifiedObjective) : null;
	const progress = doc.iterations.map(renderProgressItem).join("\n\n") || "_No progress recorded yet._";

	const body = [
		"# Goal",
		"",
		objective,
		"",
		"## Clarified Objective",
		"",
		clarified ?? "_Not clarified yet._",
		"",
		"## Progress",
		"",
		progress,
		"",
	].join("\n");

	return `---\n${JSON.stringify(front, null, 2)}\n---\n\n${body}`;
}

function isWithinGoalsDir(cwd: string, targetPath: string): boolean {
	const resolvedTarget = resolve(targetPath);
	const resolvedBase = resolve(join(cwd, ".pi", "goals"));
	return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${sep}`);
}

export class GoalContextStore {
	constructor(private readonly cwd: string) {}

	getGoalsDir(): string {
		return join(this.cwd, ".pi", "goals");
	}

	getPath(goalId: string): string {
		return join(this.getGoalsDir(), goalFilename(goalId));
	}

	getArchivePath(goalId: string, timestampSeconds: number): string {
		return join(this.getGoalsDir(), ARCHIVE_DIR, archivedGoalFilename(goalId, timestampSeconds));
	}

	getLegacyJsonPath(sessionId: string, goalId: string): string {
		return join(this.cwd, ".pi", "goals", sessionId, `${goalId}-context.json`);
	}

	async exists(goalId: string): Promise<boolean> {
		try {
			await readFile(this.getPath(goalId), "utf8");
			return true;
		} catch (err) {
			if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
				return false;
			}
			throw err;
		}
	}

	async read(goalId: string): Promise<GoalFileDocument | null> {
		const path = this.getPath(goalId);
		try {
			const raw = await readFile(path, "utf8");
			return parseGoalFileDocument(raw, path);
		} catch (err) {
			if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
				return null;
			}
			throw err;
		}
	}

	async require(goalId: string): Promise<GoalFileDocument> {
		const doc = await this.read(goalId);
		if (!doc) {
			throw new Error(`goal context does not exist: ${this.getPath(goalId)}`);
		}
		return doc;
	}

	async create(input: CreateGoalContextInput): Promise<GoalFileDocument> {
		const ts = nowSeconds();
		const doc: GoalFileDocument = {
			version: GOAL_CONTEXT_VERSION,
			id: input.goalId,
			sessionId: input.sessionId,
			cwd: this.cwd,
			originalObjective: input.originalObjective,
			clarifiedObjective: input.clarifiedObjective ?? null,
			status: "active",
			phase: "context_gathering",
			timeUsedSeconds: 0,
			successCriteria: unique(input.successCriteria ?? []),
			relevantFiles: unique(input.relevantFiles ?? []),
			constraints: unique(input.constraints ?? []),
			blockers: unique(input.blockers ?? []),
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

	async update(goalId: string, updater: (doc: GoalFileDocument) => GoalFileDocument): Promise<GoalFileDocument> {
		const current = await this.require(goalId);
		const updated = updater({ ...current });
		updated.updatedAt = nowSeconds();
		await this.write(updated);
		return updated;
	}

	async appendIteration(goalId: string, iteration: AppendGoalIterationInput): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({
			...doc,
			iterations: [...doc.iterations, this.createIteration(iteration)],
		}));
	}

	async setClarifiedObjective(goalId: string, objective: string): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({ ...doc, clarifiedObjective: objective.trim() || null }));
	}

	async setStatus(goalId: string, status: Goal["status"]): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({ ...doc, status }));
	}

	async setPhase(goalId: string, phase: Goal["phase"]): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({ ...doc, phase }));
	}

	async setTimeUsedSeconds(goalId: string, seconds: number): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({ ...doc, timeUsedSeconds: seconds }));
	}

	async addSuccessCriteria(goalId: string, criteria: string[]): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({
			...doc,
			successCriteria: unique([...doc.successCriteria, ...criteria]),
		}));
	}

	async addRelevantFiles(goalId: string, files: string[]): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({
			...doc,
			relevantFiles: unique([...doc.relevantFiles, ...files]),
		}));
	}

	async addConstraints(goalId: string, constraints: string[]): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({
			...doc,
			constraints: unique([...doc.constraints, ...constraints]),
		}));
	}

	async addBlockers(goalId: string, blockers: string[]): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({
			...doc,
			blockers: unique([...doc.blockers, ...blockers]),
		}));
	}

	async addNotes(goalId: string, notes: string[]): Promise<GoalFileDocument> {
		return this.update(goalId, (doc) => ({
			...doc,
			notes: unique([...doc.notes, ...notes]),
		}));
	}

	async archive(goalId: string): Promise<string> {
		const activePath = this.getPath(goalId);
		const timestamp = nowSeconds();
		const archivePath = this.getArchivePath(goalId, timestamp);
		await mkdir(dirname(archivePath), { recursive: true });
		await rename(activePath, archivePath);
		return archivePath;
	}

	async migrateLegacyJson(sessionId: string, goalId: string): Promise<GoalFileDocument | null> {
		const legacyPath = this.getLegacyJsonPath(sessionId, goalId);
		try {
			const raw = await readFile(legacyPath, "utf8");
			const parsed = JSON.parse(raw) as unknown;
			if (!parsed || typeof parsed !== "object") {
				return null;
			}
			const legacy = parsed as {
				goalId: string;
				sessionId: string;
				originalObjective: string;
				clarifiedObjective: string | null;
				successCriteria: string[];
				relevantFiles: string[];
				constraints: string[];
				blockers?: string[];
				notes: string[];
				iterations: GoalContextIteration[];
				createdAt: number;
			};
			const doc: GoalFileDocument = {
				version: GOAL_CONTEXT_VERSION,
				id: legacy.goalId,
				sessionId: legacy.sessionId,
				cwd: this.cwd,
				originalObjective: legacy.originalObjective,
				clarifiedObjective: legacy.clarifiedObjective,
				status: "active",
				phase: "context_gathering",
				timeUsedSeconds: 0,
				successCriteria: legacy.successCriteria,
				relevantFiles: legacy.relevantFiles,
				constraints: legacy.constraints,
				blockers: legacy.blockers ?? [],
				notes: legacy.notes,
				iterations: legacy.iterations.map((it) => ({
					...it,
					evidence: it.evidence ?? [],
				})),
				createdAt: legacy.createdAt,
				updatedAt: nowSeconds(),
			};
			await this.write(doc);
			await unlink(legacyPath);
			return doc;
		} catch (err) {
			if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
				return null;
			}
			throw err;
		}
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

	private async write(doc: GoalFileDocument): Promise<void> {
		const path = this.getPath(doc.id);
		const goalsDir = this.getGoalsDir();
		if (!isWithinGoalsDir(this.cwd, path)) {
			throw new Error(`refusing to write goal context outside goals directory: ${path}`);
		}
		await mkdir(goalsDir, { recursive: true });
		const tmpPath = `${path}.tmp.${randomUUID()}`;
		await writeFile(tmpPath, `${serializeGoalFileDocument(doc)}\n`, "utf8");
		await rename(tmpPath, path);
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
		return this.store.getPath(goalId);
	}

	async initialize(
		goal: Goal,
		input: {
			clarifiedObjective?: string | null;
			successCriteria?: string[];
			relevantFiles?: string[];
			constraints?: string[];
		} = {},
	): Promise<string> {
		const existing = await this.store.read(goal.id);
		if (!existing) {
			await this.store.create({
				sessionId: this.sessionId,
				goalId: goal.id,
				originalObjective: goal.objective,
				clarifiedObjective: input.clarifiedObjective,
				successCriteria: input.successCriteria,
				relevantFiles: input.relevantFiles,
				constraints: input.constraints,
			});
		}
		return this.getPath(goal.id);
	}

	async initializeFromDraft(draft: {
		id: string;
		originalObjective: string;
		clarifiedObjective?: string;
		successCriteria: string[];
		relevantFiles: string[];
		constraints: string[];
		notes: string[];
	}): Promise<string> {
		const existing = await this.store.read(draft.id);
		if (!existing) {
			await this.store.create({
				sessionId: this.sessionId,
				goalId: draft.id,
				originalObjective: draft.originalObjective,
				clarifiedObjective: draft.clarifiedObjective,
				successCriteria: draft.successCriteria,
				relevantFiles: draft.relevantFiles,
				constraints: draft.constraints,
				notes: draft.notes,
			});
		} else {
			await this.store.setClarifiedObjective(draft.id, draft.clarifiedObjective ?? draft.originalObjective);
			if (draft.successCriteria.length) await this.store.addSuccessCriteria(draft.id, draft.successCriteria);
			if (draft.relevantFiles.length) await this.store.addRelevantFiles(draft.id, draft.relevantFiles);
			if (draft.constraints.length) await this.store.addConstraints(draft.id, draft.constraints);
			if (draft.notes.length) await this.store.addNotes(draft.id, draft.notes);
		}
		return this.getPath(draft.id);
	}

	async migrateLegacy(goal: Goal): Promise<GoalFileDocument | null> {
		return this.store.migrateLegacyJson(this.sessionId, goal.id);
	}

	async record(goal: Goal, iteration: AppendGoalIterationInput): Promise<void> {
		await this.ensure(goal);
		await this.store.appendIteration(goal.id, iteration);
	}

	async recordStatus(goal: Goal, summary: string): Promise<void> {
		await this.record(goal, { kind: "status", summary });
		await this.store.setStatus(goal.id, goal.status);
	}

	async recordPhase(goal: Goal): Promise<void> {
		await this.store.setPhase(goal.id, goal.phase);
	}

	async recordWork(goal: Goal, summary: string, details?: string): Promise<void> {
		await this.record(goal, { kind: "work", summary, details });
	}

	async recordProgress(
		goal: Goal,
		iteration: AppendGoalIterationInput,
		updates: {
			successCriteria?: string[];
			relevantFiles?: string[];
			constraints?: string[];
			blockers?: string[];
			notes?: string[];
		} = {},
	): Promise<void> {
		await this.record(goal, iteration);
		if (updates.successCriteria?.length) {
			await this.store.addSuccessCriteria(goal.id, updates.successCriteria);
		}
		if (updates.relevantFiles?.length) {
			await this.store.addRelevantFiles(goal.id, updates.relevantFiles);
		}
		if (updates.constraints?.length) {
			await this.store.addConstraints(goal.id, updates.constraints);
		}
		if (updates.blockers?.length) {
			await this.store.addBlockers(goal.id, updates.blockers);
		}
		if (updates.notes?.length) {
			await this.store.addNotes(goal.id, updates.notes);
		}
	}

	async read(goal: Goal): Promise<GoalFileDocument | null> {
		return this.store.read(goal.id);
	}

	async recordCompletion(goal: Goal): Promise<void> {
		await this.record(goal, {
			kind: "completion",
			summary: "Goal marked complete",
			details: `Elapsed time: ${goal.timeUsedSeconds} seconds`,
		});
		await this.store.setStatus(goal.id, "complete");
	}

	async archive(goal: Goal): Promise<string> {
		return this.store.archive(goal.id);
	}

	private async ensure(goal: Goal): Promise<void> {
		if (!(await this.store.exists(goal.id))) {
			await this.store.create({
				sessionId: this.sessionId,
				goalId: goal.id,
				originalObjective: goal.objective,
			});
		}
	}
}
