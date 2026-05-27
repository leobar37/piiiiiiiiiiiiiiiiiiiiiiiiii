/**
 * Typed oRPC client for the dashboard API.
 *
 * In Electron, the backend URL is injected via query param (?backendUrl=...).
 * In a regular browser, it falls back to window.location.origin.
 */

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { DashboardClient } from "./api-types.js";

function getBackendUrl(): string {
	const params = new URLSearchParams(window.location.search);
	const backendUrl = params.get("backendUrl");
	if (backendUrl) {
		return backendUrl;
	}
	return window.location.origin;
}

const link = new RPCLink({
	url: `${getBackendUrl()}/api`,
});

const client = createORPCClient(link) as unknown as DashboardClient;

export const orpc = client;

// Re-export types for convenience
export type { ServerEvent } from "@local/pi-dashboard";
export type { SessionInfo, SessionStatus } from "@local/pi-dashboard";
