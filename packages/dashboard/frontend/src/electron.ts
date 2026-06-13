export interface ElectronApi {
	readonly platform: string;
	readonly versions: {
		readonly electron: string;
		readonly chrome: string;
		readonly node: string;
	};
	chooseProjectDirectory(): Promise<string | null>;
}

declare global {
	interface Window {
		readonly __PI_ELECTRON__?: ElectronApi;
	}
}

export function getElectronApi(): ElectronApi | undefined {
	return window.__PI_ELECTRON__;
}
