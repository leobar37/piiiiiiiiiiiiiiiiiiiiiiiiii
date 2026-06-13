/**
 * Electron main process.
 *
 * Spawns the Bun-compiled pi-web backend, waits for it to be ready,
 * then loads the React frontend with the backend URL injected via query param.
 */

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BACKEND_READY_REGEX = /pi-web running at (http:\/\/[^\s]+)/;
const HEALTHCHECK_TIMEOUT_MS = 30000;
const HEALTHCHECK_INTERVAL_MS = 200;
const KILL_TIMEOUT_MS = 3000;

let backendProcess: ChildProcessWithoutNullStreams | null = null;
let mainWindow: BrowserWindow | null = null;
let backendUrl: string | null = null;

ipcMain.handle("project:choose-directory", async () => {
	const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
		properties: ["openDirectory", "createDirectory"],
		title: "Choose project folder",
	});
	if (result.canceled) return null;
	return result.filePaths[0] ?? null;
});

/**
 * Determine the path to the compiled backend binary.
 * In dev: uses the binary built by `bun run build:binary`.
 * In packaged: uses `process.resourcesPath` where electron-builder places extraResources.
 */
function getBackendBinaryPath(): string {
	const isPackaged = app.isPackaged;
	if (isPackaged) {
		return join(process.resourcesPath, "pi-web-binary");
	}
	return join(__dirname, "..", "dist", "pi-web-binary");
}

/**
 * Wait for the backend healthcheck endpoint to respond.
 */
async function waitForBackend(url: string, timeoutMs: number, intervalMs: number): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(`${url}/api`, { method: "HEAD" });
			if (res.ok || res.status === 404) {
				return;
			}
		} catch {
			// not ready yet
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	throw new Error(`Backend at ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Start the backend binary and resolve with its URL once ready.
 */
function normalizeUrl(url: string): string {
	return url.replace(/\/$/, "");
}

async function startBackend(): Promise<string> {
	const binaryPath = getBackendBinaryPath();

	return new Promise((resolve, reject) => {
		const proc = spawn(binaryPath, ["--port", "0", "--host", "127.0.0.1"], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		backendProcess = proc;

		let localBackendUrl: string | null = null;
		let stdoutBuffer = "";

		proc.stdout.on("data", (data: Buffer) => {
			const text = data.toString("utf-8");
			stdoutBuffer += text;
			process.stdout.write(`[backend] ${text}`);

			const match = BACKEND_READY_REGEX.exec(stdoutBuffer);
			if (match && !localBackendUrl) {
				localBackendUrl = normalizeUrl(match[1]);
				backendUrl = localBackendUrl;
				resolve(localBackendUrl);
			}
		});

		proc.stderr.on("data", (data: Buffer) => {
			process.stderr.write(`[backend] ${data.toString("utf-8")}`);
		});

		proc.on("error", (err) => {
			reject(new Error(`Failed to start backend: ${err.message}`));
		});

		proc.on("exit", (code) => {
			if (!localBackendUrl) {
				reject(new Error(`Backend exited with code ${code} before becoming ready`));
			}
		});
	});
}

/**
 * Kill the backend process gracefully, then forcefully.
 */
function killBackend(): void {
	if (!backendProcess) return;

	try {
		backendProcess.kill("SIGTERM");
	} catch {
		// ignore
	}

	setTimeout(() => {
		try {
			backendProcess?.kill("SIGKILL");
		} catch {
			// ignore
		}
	}, KILL_TIMEOUT_MS);

	backendProcess = null;
}

/**
 * Create the main BrowserWindow.
 */
function createWindow(backendUrl: string): void {
	const indexPath = join(__dirname, "..", "frontend", "dist", "index.html");
	const loadUrl = `file://${indexPath}?backendUrl=${encodeURIComponent(backendUrl)}`;

	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 800,
		minHeight: 600,
		webPreferences: {
			preload: join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
		show: false,
		titleBarStyle: "hiddenInset",
	});

	mainWindow.loadURL(loadUrl);

	mainWindow.once("ready-to-show", () => {
		mainWindow?.show();
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
	process.exit(0);
}

app.on("second-instance", () => {
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.focus();
	}
});

// App lifecycle
app.whenReady().then(async () => {
	try {
		const backendUrl = await startBackend();
		await waitForBackend(backendUrl, HEALTHCHECK_TIMEOUT_MS, HEALTHCHECK_INTERVAL_MS);
		createWindow(backendUrl);
	} catch (err) {
		console.error("Failed to start dashboard:", err);
		app.quit();
	}
});

app.on("before-quit", () => {
	killBackend();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (mainWindow === null && backendProcess !== null && backendUrl !== null) {
		createWindow(backendUrl);
	}
});
