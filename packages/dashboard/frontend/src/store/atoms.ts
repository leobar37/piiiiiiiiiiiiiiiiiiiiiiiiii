import { atom } from "jotai";
import type { Atom } from "jotai";
import type { SessionRuntime, SessionEntry, ChatMessage, StreamingState } from "./runtime.js";
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

/** Atom for sessions grouped by cwd. */
export function sessionsByCwdAtom(runtime: SessionRuntime): Atom<Map<string, SessionEntry[]>> {
	return atom((get) => {
		const index = get(runtime.indexes.sessionsByCwd.indexAtom);
		const result = new Map<string, SessionEntry[]>();
		for (const [cwd, sessionIds] of index) {
			const entries = sessionIds
				.map((id) => get(runtime.maps.sessions.atomFor(id)))
				.filter((e): e is SessionEntry => e !== undefined);
			result.set(cwd, entries);
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
