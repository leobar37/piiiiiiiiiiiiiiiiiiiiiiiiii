import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useSessionRuntime } from "./provider.js";
import {
	sessionAtom,
	sessionMessagesAtom,
	streamingStateAtom,
	sessionListAtom,
	sessionsByCwdAtom,
	sessionModelAtom,
} from "./atoms.js";
import type { SessionEntry, ChatMessage, StreamingState } from "./runtime.js";
import type { ModelInfo } from "../api-types.js";

// ---------------------------------------------------------------------------
// Session hooks — thin wrappers over atoms. All logic lives in the runtime.
// ---------------------------------------------------------------------------

export function useSession(sessionId: string | null): SessionEntry | undefined {
	const runtime = useSessionRuntime();
	const a = useMemo(() => sessionAtom(runtime, sessionId), [runtime, sessionId]);
	return useAtomValue(a, { store: runtime.store });
}

export function useSessionMessages(sessionId: string | null): ChatMessage[] {
	const runtime = useSessionRuntime();
	const a = useMemo(() => sessionMessagesAtom(runtime, sessionId), [runtime, sessionId]);
	return useAtomValue(a, { store: runtime.store });
}

export function useSessionStreaming(sessionId: string | null): StreamingState {
	const runtime = useSessionRuntime();
	const a = useMemo(() => streamingStateAtom(runtime, sessionId), [runtime, sessionId]);
	return (
		useAtomValue(a, { store: runtime.store }) ?? {
			isStreaming: false,
			isCompacting: false,
			isRetrying: false,
			retryInfo: null,
			pendingSteering: [],
			pendingFollowUp: [],
		}
	);
}

export function useSessionList(): SessionEntry[] {
	const runtime = useSessionRuntime();
	const a = useMemo(() => sessionListAtom(runtime), [runtime]);
	return useAtomValue(a, { store: runtime.store });
}

export function useSessionsByCwd(): Map<string, SessionEntry[]> {
	const runtime = useSessionRuntime();
	const a = useMemo(() => sessionsByCwdAtom(runtime), [runtime]);
	return useAtomValue(a, { store: runtime.store });
}

export function useSessionModel(sessionId: string | null): ModelInfo | undefined {
	const runtime = useSessionRuntime();
	const a = useMemo(() => sessionModelAtom(runtime, sessionId), [runtime, sessionId]);
	return useAtomValue(a, { store: runtime.store });
}
