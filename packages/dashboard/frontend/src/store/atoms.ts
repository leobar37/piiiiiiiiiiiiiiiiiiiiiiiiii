import { atom } from "jotai";
import type { Atom } from "jotai";
import type { SessionRuntime, SessionEntry, ChatMessage, StreamingState, SubagentEntry } from "./runtime.js";
import type { ModelInfo } from "../api-types.js";

// ---------------------------------------------------------------------------
// Atom caches — prevent memory leaks from recreating atoms on every render.
// Each SessionRuntime gets its own keyed cache so atoms are stable.
// ---------------------------------------------------------------------------

const sessionAtomCache = new WeakMap<
	SessionRuntime,
	Map<string, Atom<SessionEntry | undefined>>
>();
const sessionMsgsAtomCache = new WeakMap<SessionRuntime, Map<string, Atom<ChatMessage[]>>>();
const streamingAtomCache = new WeakMap<
	SessionRuntime,
	Map<string, Atom<StreamingState | undefined>>
>();
const sessionModelAtomCache = new WeakMap<
	SessionRuntime,
	Map<string, Atom<ModelInfo | undefined>>
>();
const subagentAtomCache = new WeakMap<
	SessionRuntime,
	Map<string, Atom<SubagentEntry | undefined>>
>();
const subagentIdsAtomCache = new WeakMap<SessionRuntime, Map<string, Atom<string[]>>>();
const subagentsBySessionAtomCache = new WeakMap<SessionRuntime, Map<string, Atom<SubagentEntry[]>>>();
const subagentTreeAtomCache = new WeakMap<SessionRuntime, Map<string, Atom<SubagentEntry[]>>>();

function getCachedAtom<K, V>(
	cache: WeakMap<SessionRuntime, Map<K, Atom<V>>>,
	runtime: SessionRuntime,
	key: K,
	factory: () => Atom<V>,
): Atom<V> {
	let runtimeCache = cache.get(runtime);
	if (!runtimeCache) {
		runtimeCache = new Map();
		cache.set(runtime, runtimeCache);
	}
	const cached = runtimeCache.get(key);
	if (cached) return cached;
	const created = factory();
	runtimeCache.set(key, created);
	return created;
}

// ---------------------------------------------------------------------------
// Session atoms
// ---------------------------------------------------------------------------

/** Atom for a single session by id. */
export function sessionAtom(
	runtime: SessionRuntime,
	sessionId: string | null,
): Atom<SessionEntry | undefined> {
	if (!sessionId) return atom(() => undefined);
	return getCachedAtom(sessionAtomCache, runtime, sessionId, () =>
		atom((get) => get(runtime.maps.sessions.atomFor(sessionId))),
	);
}

/** Atom for all session entries. */
export function sessionListAtom(runtime: SessionRuntime): Atom<SessionEntry[]> {
	return atom((get) => {
		const entries = get(runtime.maps.sessions.entriesAtom);
		return entries.map(([, entry]) => entry);
	});
}

/** Atom for sessions grouped by project id. */
export function sessionsByProjectIdAtom(runtime: SessionRuntime): Atom<Map<string, SessionEntry[]>> {
	return atom((get) => {
		const index = get(runtime.indexes.sessionsByProjectId.indexAtom);
		const result = new Map<string, SessionEntry[]>();
		for (const [projectId, sessionIds] of index) {
			const entries = sessionIds
				.map((id) => get(runtime.maps.sessions.atomFor(id)))
				.filter((e): e is SessionEntry => e !== undefined);
			result.set(projectId, entries);
		}
		return result;
	});
}

// ---------------------------------------------------------------------------
// Message atoms
// ---------------------------------------------------------------------------

/** Atom for message ids ordered by session. */
export function sessionMessageIdsAtom(
	runtime: SessionRuntime,
	sessionId: string | null,
): Atom<string[]> {
	if (!sessionId) return atom(() => []);
	return atom((get) => get(runtime.indexes.messagesBySession.atomFor(sessionId)));
}

/** Atom for all messages of a session, ordered. */
export function sessionMessagesAtom(
	runtime: SessionRuntime,
	sessionId: string | null,
): Atom<ChatMessage[]> {
	if (!sessionId) return atom(() => []);
	return getCachedAtom(sessionMsgsAtomCache, runtime, sessionId, () =>
		atom((get) => {
			const msgIds = get(runtime.indexes.messagesBySession.atomFor(sessionId));
			return msgIds
				.map((id) => get(runtime.maps.messages.atomFor(id)))
				.filter((m): m is ChatMessage => m !== undefined);
		}),
	);
}

// ---------------------------------------------------------------------------
// Streaming atoms
// ---------------------------------------------------------------------------

/** Atom for the streaming state of a session. */
export function streamingStateAtom(
	runtime: SessionRuntime,
	sessionId: string | null,
): Atom<StreamingState | undefined> {
	if (!sessionId) return atom(() => undefined);
	return getCachedAtom(streamingAtomCache, runtime, sessionId, () =>
		atom((get) => {
			const state = get(runtime.maps.streaming.atomFor(sessionId));
			return (
				state ?? {
					isStreaming: false,
					isCompacting: false,
					isRetrying: false,
					retryInfo: null,
					pendingSteering: [],
					pendingFollowUp: [],
				}
			);
		}),
	);
}

// ---------------------------------------------------------------------------
// Model atoms
// ---------------------------------------------------------------------------

/** Atom for the selected model of a session. */
export function sessionModelAtom(
	runtime: SessionRuntime,
	sessionId: string | null,
): Atom<ModelInfo | undefined> {
	if (!sessionId) return atom(() => undefined);
	return getCachedAtom(sessionModelAtomCache, runtime, sessionId, () =>
		atom((get) => {
			const entry = get(runtime.maps.sessions.atomFor(sessionId));
			return entry?.model;
		}),
	);
}

// ---------------------------------------------------------------------------
// Subagent atoms
// ---------------------------------------------------------------------------

/** Atom for a single subagent by id. */
export function subagentAtom(
	runtime: SessionRuntime,
	subagentId: string | null,
): Atom<SubagentEntry | undefined> {
	if (!subagentId) return atom(() => undefined);
	return getCachedAtom(subagentAtomCache, runtime, subagentId, () =>
		atom((get) => get(runtime.maps.subagents.atomFor(subagentId))),
	);
}

/** Atom for all subagent entries. */
export function subagentListAtom(runtime: SessionRuntime): Atom<SubagentEntry[]> {
	return atom((get) => {
		const entries = get(runtime.maps.subagents.entriesAtom);
		return entries.map(([, entry]) => entry);
	});
}

/** Atom for subagent ids ordered by session. */
export function subagentIdsBySessionAtom(
	runtime: SessionRuntime,
	sessionId: string | null,
): Atom<string[]> {
	if (!sessionId) return atom(() => []);
	return getCachedAtom(subagentIdsAtomCache, runtime, sessionId, () =>
		atom((get) => get(runtime.indexes.subagentsBySession.atomFor(sessionId))),
	);
}

/** Atom for all subagents of a session, ordered. */
export function subagentsBySessionAtom(
	runtime: SessionRuntime,
	sessionId: string | null,
): Atom<SubagentEntry[]> {
	if (!sessionId) return atom(() => []);
	return getCachedAtom(subagentsBySessionAtomCache, runtime, sessionId, () =>
		atom((get) => {
			const ids = get(runtime.indexes.subagentsBySession.atomFor(sessionId));
			return ids
				.map((id) => get(runtime.maps.subagents.atomFor(id)))
				.filter((e): e is SubagentEntry => e !== undefined);
		}),
	);
}

/** Atom for subagent tree — children grouped by parentId. */
export function subagentTreeAtom(
	runtime: SessionRuntime,
	parentId: string | null,
): Atom<SubagentEntry[]> {
	const cacheKey = parentId ?? "__root__";
	return getCachedAtom(subagentTreeAtomCache, runtime, cacheKey, () =>
		atom((get) => {
			if (parentId === null) {
				const entries = get(runtime.maps.subagents.entriesAtom);
				return entries
					.filter(([, entry]) => entry.parentId === null)
					.map(([, entry]) => entry);
			}
			const ids = get(runtime.indexes.subagentTree.atomFor(parentId));
			return ids
				.map((id) => get(runtime.maps.subagents.atomFor(id)))
				.filter((e): e is SubagentEntry => e !== undefined);
		}),
	);
}
