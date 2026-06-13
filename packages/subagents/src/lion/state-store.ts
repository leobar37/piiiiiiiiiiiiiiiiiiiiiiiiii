import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createLionCore, type LionCore } from "./core.js";
import type { LionState } from "./types.js";

const LION_STATE_FILE = ".pi/lion/state.json";
const LION_DOCUMENT_VERSION = 4;

export interface PersistedLionDocument {
	version: number;
	sessionId: string | null;
	state: LionState;
	core: LionCore;
	updatedAt: number;
}

export interface LionStateStoreResult {
	state: LionState;
	core: LionCore;
}

/**
 * Reads Lion state from a dedicated file on disk.
 * Falls back to legacy session entries if the file does not exist.
 * Returns null if neither source has valid state.
 */
export function readLionState(cwd: string, ctx?: ExtensionContext): LionStateStoreResult | null {
	const path = getLionStatePath(cwd);

	// 1. Try dedicated file first
	if (existsSync(path)) {
		try {
			const raw = readFileSync(path, "utf-8");
			const doc = JSON.parse(raw) as PersistedLionDocument | Omit<PersistedLionDocument, "sessionId">;
			if (
				doc.version === LION_DOCUMENT_VERSION &&
				isValidDocumentSession(doc) &&
				isValidState(doc.state) &&
				isValidCore(doc.core) &&
				isCurrentSessionDocument(doc, ctx)
			) {
				return { state: doc.state, core: doc.core };
			}
			if (
				doc.version === 3 &&
				isValidState(doc.state) &&
				isValidCore(doc.core) &&
				isSafeOwnerlessDocument(doc, ctx)
			) {
				return { state: doc.state, core: doc.core };
			}
		} catch {
			// Corrupted file — fall through to legacy or initial state
		}
	}

	// 2. Fallback: legacy session entries (one-time migration path)
	if (ctx) {
		const legacy = readLegacyLionState(ctx);
		if (legacy) {
			// Migrate to new file format for next time
			writeLionState(cwd, legacy.state, legacy.core, ctx.sessionManager.getSessionId());
			return legacy;
		}
	}

	return null;
}

/**
 * Writes Lion state atomically to disk.
 */
export function writeLionState(cwd: string, state: LionState, core: LionCore, sessionId: string | null = null): void {
	const path = getLionStatePath(cwd);
	const dir = dirname(path);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	const doc: PersistedLionDocument = {
		version: LION_DOCUMENT_VERSION,
		sessionId,
		state,
		core,
		updatedAt: Date.now(),
	};

	const tempPath = `${path}.tmp`;
	try {
		writeFileSync(tempPath, `${JSON.stringify(doc, null, 2)}\n`, "utf-8");
		renameSync(tempPath, path);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[lion] failed to persist state: ${message}`);
		// Best effort: clean up temp file
		try {
			if (existsSync(tempPath)) {
				unlinkSync(tempPath);
			}
		} catch {
			/* ignore cleanup errors */
		}
	}
}

export function getLionStatePath(cwd: string): string {
	return join(cwd, LION_STATE_FILE);
}

// ============================================================================
// Legacy migration helpers
// ============================================================================

const LION_STATE_ENTRY_TYPE_LEGACY = "lion-state";
const LION_CORE_ENTRY_TYPE_LEGACY = "lion-core";

interface LegacyPersistedLionState extends LionState {
	action: string;
	updatedAt: number;
}

interface LegacyPersistedLionCore {
	version: number;
	action: string;
	activeRun: LionCore["activeRun"];
	runHistory: LionCore["runHistory"];
	updatedAt: number;
}

function readLegacyLionState(ctx: ExtensionContext): LionStateStoreResult | null {
	const branch = ctx.sessionManager?.getBranch?.() ?? [];

	const states = branch
		.filter((entry) => entry.type === "custom" && entry.customType === LION_STATE_ENTRY_TYPE_LEGACY)
		.map((entry) => (entry as { data: LegacyPersistedLionState }).data)
		.sort((a, b) => a.updatedAt - b.updatedAt);

	const cores = branch
		.filter((entry) => entry.type === "custom" && entry.customType === LION_CORE_ENTRY_TYPE_LEGACY)
		.map((entry) => (entry as { data: LegacyPersistedLionCore }).data)
		.sort((a, b) => a.updatedAt - b.updatedAt);

	const lastState = states[states.length - 1];
	const lastCore = cores[cores.length - 1];

	if (!lastState || lastState.version !== 2) {
		return null;
	}

	const { action: _action, updatedAt: _updatedAt, ...state } = lastState;

	const core: LionCore =
		lastCore && lastCore.version === 1
			? {
					activeRun: lastCore.activeRun,
					runHistory: lastCore.runHistory,
				}
			: createLionCore();

	return { state: state as LionState, core };
}

// ============================================================================
// Validation
// ============================================================================

function isValidState(value: unknown): value is LionState {
	if (!value || typeof value !== "object") return false;
	const s = value as Record<string, unknown>;
	return (
		s.version === 2 &&
		typeof s.active === "boolean" &&
		typeof s.strategy === "string" &&
		typeof s.phase === "string" &&
		typeof s.maxAttempts === "number" &&
		(s.activePlanPath === null || typeof s.activePlanPath === "string") &&
		(s.activePlanSlug === null || typeof s.activePlanSlug === "string") &&
		(s.activeTaskId === null || typeof s.activeTaskId === "string") &&
		(s.lastRunId === null || typeof s.lastRunId === "string")
	);
}

function isValidCore(value: unknown): value is LionCore {
	if (!value || typeof value !== "object") return false;
	const c = value as Record<string, unknown>;
	return Array.isArray(c.runHistory) && (c.activeRun === null || typeof c.activeRun === "object");
}

function isValidDocumentSession(value: unknown): value is PersistedLionDocument {
	if (!value || typeof value !== "object") return false;
	const doc = value as Record<string, unknown>;
	return doc.sessionId === null || typeof doc.sessionId === "string";
}

function isCurrentSessionDocument(doc: PersistedLionDocument, ctx?: ExtensionContext): boolean {
	if (!ctx) return true;
	if (doc.sessionId === null) return !doc.state.active;
	return doc.sessionId === ctx.sessionManager.getSessionId();
}

function isSafeOwnerlessDocument(doc: Omit<PersistedLionDocument, "sessionId">, ctx?: ExtensionContext): boolean {
	if (!ctx) return true;
	return !doc.state.active;
}
