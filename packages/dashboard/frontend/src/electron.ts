/**
 * Helpers for interacting with the Electron preload API.
 */

export interface ElectronApi {
	readonly platform: string;
	readonly versions: {
		readonly electron: string;
		readonly chrome: string;
		readonly node: string;
	};
	/**
	 * Resolves with the subagents backend URL once it is available.
	 */
	getBackendUrl(): Promise<string>;
	chooseProjectDirectory(): Promise<string | null>;
}

declare global {
	interface Window {
		readonly __PI_ELECTRON__?: ElectronApi;
	}
}

export async function getElectronBackendUrl(): Promise<string | null> {
	if (typeof window !== "undefined" && window.__PI_ELECTRON__) {
		try {
			return await window.__PI_ELECTRON__.getBackendUrl();
		} catch (err) {
			console.error("Failed to get backend URL from Electron:", err);
		}
	}
	return null;
}

/**
 * Resolve a backend URL for a canvas session. In Electron this comes from the
 * preload API. Outside Electron it can be provided via the ?backendUrl= query
 * param for local development.
 */
export async function resolveBackendUrl(): Promise<string | null> {
	const electronUrl = await getElectronBackendUrl();
	if (electronUrl) return electronUrl;

	const params = new URLSearchParams(window.location.search);
	const queryUrl = params.get("backendUrl");
	if (queryUrl) return queryUrl;

	return null;
}
