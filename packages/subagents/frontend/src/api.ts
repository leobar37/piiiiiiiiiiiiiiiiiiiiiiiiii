import type { ChatMessage, SubAgentEvent, SubAgentInstanceState } from "./types.ts";

const BASE = "";

async function fetchJson<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}${path}`);
	if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
	return res.json() as Promise<T>;
}

export async function fetchAgents(): Promise<SubAgentInstanceState[]> {
	return fetchJson<SubAgentInstanceState[]>("/api/instances");
}

export async function fetchAgent(instanceId: string): Promise<SubAgentInstanceState> {
	return fetchJson<SubAgentInstanceState>(`/api/instances/${encodeURIComponent(instanceId)}`);
}

export async function fetchAgentEvents(instanceId: string): Promise<SubAgentEvent[]> {
	return fetchJson<SubAgentEvent[]>(`/api/instances/${encodeURIComponent(instanceId)}/events`);
}

export async function fetchAgentMessages(instanceId: string): Promise<ChatMessage[]> {
	return fetchJson<ChatMessage[]>(`/api/instances/${encodeURIComponent(instanceId)}/messages`);
}
