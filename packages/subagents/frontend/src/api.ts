import type {
	ChatMessage,
	LionChecklistKind,
	LionChecklistSnapshot,
	LionDashboardState,
	SubAgentInstanceState,
	SubAgentRunRecord,
} from "./types.ts";
import { convertAgentMessages } from "./utils/message-converter.ts";

const BASE = "";

async function fetchJson<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}${path}`);
	if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
	return res.json() as Promise<T>;
}

export async function fetchAgents(): Promise<SubAgentInstanceState[]> {
	return fetchJson<SubAgentInstanceState[]>("/api/threads");
}

export async function fetchLionState(): Promise<LionDashboardState> {
	return fetchJson<LionDashboardState>("/api/lion/state");
}

export async function fetchLionChecklist(
	kind: LionChecklistKind,
	reference?: string,
): Promise<LionChecklistSnapshot> {
	const params = new URLSearchParams({ kind });
	if (reference) params.set("reference", reference);
	return fetchJson<LionChecklistSnapshot>(`/api/lion/checklist?${params.toString()}`);
}

export async function fetchAgent(instanceId: string): Promise<SubAgentInstanceState> {
	return fetchJson<SubAgentInstanceState>(`/api/threads/${encodeURIComponent(instanceId)}`);
}

export async function fetchAgentMessages(instanceId: string): Promise<ChatMessage[]> {
	const raw = await fetchJson<Array<Record<string, unknown>>>(`/api/threads/${encodeURIComponent(instanceId)}/messages`);
	return convertAgentMessages(instanceId, raw);
}

export async function fetchAgentRun(instanceId: string): Promise<SubAgentRunRecord> {
	return fetchJson<SubAgentRunRecord>(`/api/threads/${encodeURIComponent(instanceId)}/run`);
}
