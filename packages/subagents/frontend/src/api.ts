import type {
	ChatMessage,
	LionDashboardState,
	SubAgentEvent,
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

export async function fetchAgent(instanceId: string): Promise<SubAgentInstanceState> {
	return fetchJson<SubAgentInstanceState>(`/api/threads/${encodeURIComponent(instanceId)}`);
}

export async function fetchAgentEvents(instanceId: string): Promise<SubAgentEvent[]> {
	return fetchJson<SubAgentEvent[]>(`/api/threads/${encodeURIComponent(instanceId)}/events`);
}

export async function fetchAgentMessages(instanceId: string): Promise<ChatMessage[]> {
	const raw = await fetchJson<Array<Record<string, unknown>>>(`/api/threads/${encodeURIComponent(instanceId)}/messages`);
	if (raw.every(isChatMessageRecord)) {
		return raw;
	}
	return convertAgentMessages(instanceId, raw);
}

export async function fetchAgentRun(instanceId: string): Promise<SubAgentRunRecord> {
	return fetchJson<SubAgentRunRecord>(`/api/threads/${encodeURIComponent(instanceId)}/run`);
}

function isChatMessageRecord(message: Record<string, unknown>): message is Record<string, unknown> & ChatMessage {
	return (
		typeof message.id === "string" &&
		typeof message.instanceId === "string" &&
		(message.role === "user" || message.role === "assistant" || message.role === "tool" || message.role === "system") &&
		Array.isArray(message.blocks) &&
		typeof message.timestamp === "number"
	);
}
