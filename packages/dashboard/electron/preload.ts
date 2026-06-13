/**
 * Electron preload script.
 *
 * Exposes a minimal, typed API to the renderer process via contextBridge.
 * All exposed APIs are read-only and safe.
 */

import { contextBridge, ipcRenderer } from "electron";

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

const api: ElectronApi = {
	platform: process.platform,
	versions: {
		electron: process.versions.electron,
		chrome: process.versions.chrome,
		node: process.versions.node,
	},
	getBackendUrl: () => ipcRenderer.invoke("get-backend-url"),
	chooseProjectDirectory: () => ipcRenderer.invoke("choose-project-directory"),
};

contextBridge.exposeInMainWorld("__PI_ELECTRON__", api);

// Augment the global Window interface for TypeScript in the renderer
declare global {
	interface Window {
		readonly __PI_ELECTRON__?: ElectronApi;
	}
}
