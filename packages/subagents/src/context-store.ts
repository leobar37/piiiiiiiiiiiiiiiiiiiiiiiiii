import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
	RecordSubAgentContextInput,
	SubAgentContextDocument,
	SubAgentContextEntry,
	SubAgentContextStore as SubAgentContextStoreContract,
} from "./types.js";

const SUBAGENT_CONTEXT_VERSION = 1;

export class SubAgentContextStore implements SubAgentContextStoreContract {
	constructor(private readonly cwd: string) {}

	getPath(sessionId: string, taskId: string): string {
		return join(this.cwd, ".pi", "subagents", "context", sessionId, `${taskId}.json`);
	}

	async read(sessionId: string, taskId: string): Promise<SubAgentContextDocument | null> {
		const path = this.getPath(sessionId, taskId);
		try {
			return parseDocument(await readFile(path, "utf8"), path);
		} catch (err) {
			if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
				return null;
			}
			throw err;
		}
	}

	async record(input: {
		sessionId: string;
		taskId: string;
		definitionName: string;
		entry: RecordSubAgentContextInput;
	}): Promise<SubAgentContextDocument> {
		const current =
			(await this.read(input.sessionId, input.taskId)) ??
			this.createDocument(input.sessionId, input.taskId, input.definitionName);
		const updated: SubAgentContextDocument = {
			...current,
			definitionName: input.definitionName,
			updatedAt: Date.now(),
			entries: [...current.entries, createEntry(input.entry)],
		};
		await this.write(updated);
		return updated;
	}

	async formatForPrompt(sessionId: string, taskId: string, limit = 8): Promise<string> {
		const doc = await this.read(sessionId, taskId);
		if (!doc || doc.entries.length === 0) {
			return "No durable subagent context has been recorded.";
		}

		return doc.entries
			.slice(-limit)
			.map((entry) => {
				const details = entry.details ? ` Details: ${entry.details}` : "";
				const files = entry.files.length > 0 ? ` Files: ${entry.files.join(", ")}` : "";
				const decisions = entry.decisions.length > 0 ? ` Decisions: ${entry.decisions.join("; ")}` : "";
				const blockers = entry.blockers.length > 0 ? ` Blockers: ${entry.blockers.join("; ")}` : "";
				return `- ${entry.kind}: ${entry.summary}${details}${files}${decisions}${blockers}`;
			})
			.join("\n");
	}

	private createDocument(sessionId: string, taskId: string, definitionName: string): SubAgentContextDocument {
		const now = Date.now();
		return {
			version: SUBAGENT_CONTEXT_VERSION,
			sessionId,
			taskId,
			definitionName,
			cwd: this.cwd,
			createdAt: now,
			updatedAt: now,
			entries: [],
		};
	}

	private async write(doc: SubAgentContextDocument): Promise<void> {
		const path = this.getPath(doc.sessionId, doc.taskId);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
	}
}

function createEntry(input: RecordSubAgentContextInput): SubAgentContextEntry {
	return {
		id: randomUUID(),
		kind: input.kind,
		summary: input.summary.trim(),
		details: input.details?.trim() || undefined,
		files: unique(input.files ?? []),
		decisions: unique(input.decisions ?? []),
		blockers: unique(input.blockers ?? []),
		createdAt: Date.now(),
	};
}

function parseDocument(raw: string, path: string): SubAgentContextDocument {
	const parsed = JSON.parse(raw) as unknown;
	if (!parsed || typeof parsed !== "object") {
		throw new Error(`Invalid subagent context document at ${path}`);
	}
	const doc = parsed as SubAgentContextDocument;
	if (
		doc.version !== SUBAGENT_CONTEXT_VERSION ||
		typeof doc.sessionId !== "string" ||
		typeof doc.taskId !== "string" ||
		typeof doc.definitionName !== "string" ||
		typeof doc.cwd !== "string" ||
		typeof doc.createdAt !== "number" ||
		typeof doc.updatedAt !== "number" ||
		!Array.isArray(doc.entries)
	) {
		throw new Error(`Invalid subagent context document shape at ${path}`);
	}
	for (const entry of doc.entries) {
		assertEntry(entry, path);
	}
	return doc;
}

function assertEntry(entry: SubAgentContextEntry, path: string): void {
	if (
		typeof entry.id !== "string" ||
		!isContextKind(entry.kind) ||
		typeof entry.summary !== "string" ||
		typeof entry.createdAt !== "number" ||
		!Array.isArray(entry.files) ||
		!Array.isArray(entry.decisions) ||
		!Array.isArray(entry.blockers)
	) {
		throw new Error(`Invalid subagent context entry at ${path}`);
	}
}

function isContextKind(value: string): value is SubAgentContextEntry["kind"] {
	return (
		value === "context" ||
		value === "decision" ||
		value === "blocker" ||
		value === "evidence" ||
		value === "file" ||
		value === "status"
	);
}

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
