/**
 * Electron main process.
 *
 * Spawns the Pi coding-agent in web mode, waits for the Lion dashboard URL,
 * then loads the React frontend. The renderer obtains the backend URL through
 * the preload script via IPC.
 */

import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DASHBOARD_URL_REGEX = /\[lion\] dashboard at (https?:\/\/[^\s]+)/;
const HEALTHCHECK_TIMEOUT_MS = 30000;
const HEALTHCHECK_INTERVAL_MS = 200;
const KILL_TIMEOUT_MS = 3000;
const MAX_STDOUT_BUFFER_SIZE = 8192;

let mainWindow: BrowserWindow | null = null;

class BackendManager {
	private process: ChildProcessWithoutNullStreams | null = null;
	private urlPromise: Promise<string> | null = null;
	private urlResolve: ((url: string) => void) | null = null;
	private urlReject: ((err: Error) => void) | null = null;
	private resolvedUrl: string | null = null;
	private stdoutBuffer = "";

	getUrl(): Promise<string> {
		if (this.resolvedUrl) {
			return Promise.resolve(this.resolvedUrl);
		}
		if (this.urlPromise) {
			return this.urlPromise;
		}
		this.urlPromise = new Promise<string>((resolve, reject) => {
			this.urlResolve = resolve;
			this.urlReject = reject;
		});
		return this.urlPromise;
	}

	private resolveUrl(url: string): void {
		if (this.resolvedUrl) return;
		this.resolvedUrl = url;
		this.urlResolve?.(url);
		this.urlResolve = null;
		this.urlReject = null;
	}

	private rejectUrl(err: Error): void {
		if (this.resolvedUrl) return;
		this.urlReject?.(err);
		this.urlResolve = null;
		this.urlReject = null;
		this.urlPromise = null;
	}

	private appendStdout(text: string): void {
		this.stdoutBuffer += text;
		if (this.stdoutBuffer.length > MAX_STDOUT_BUFFER_SIZE) {
			this.stdoutBuffer = this.stdoutBuffer.slice(-MAX_STDOUT_BUFFER_SIZE);
		}
	}

	private parseUrl(): string | null {
		const match = DASHBOARD_URL_REGEX.exec(this.stdoutBuffer);
		return match ? match[1].replace(/\/$/, "") : null;
	}

	start(): void {
		if (this.process) {
			return;
		}

		const backendCommand = getBackendCommand();
		const proc = spawn(backendCommand.command, backendCommand.args, {
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				LION_AUTO_ACTIVATE: "true",
			},
		});

		this.process = proc;

		proc.stdout.on("data", (data: Buffer) => {
			const text = data.toString("utf-8");
			this.appendStdout(text);
			process.stdout.write(`[backend] ${text}`);

			const url = this.parseUrl();
			if (url) {
				this.resolveUrl(url);
			}
		});

		proc.stderr.on("data", (data: Buffer) => {
			process.stderr.write(`[backend] ${data.toString("utf-8")}`);
		});

		proc.on("error", (err) => {
			this.rejectUrl(new Error(`Failed to start backend: ${err.message}`));
		});

		proc.on("exit", (code) => {
			if (!this.resolvedUrl) {
				this.rejectUrl(new Error(`Backend exited with code ${code} before becoming ready`));
			} else {
				console.error(`[backend] Backend exited unexpectedly with code ${code}`);
				this.handleUnexpectedExit();
			}
		});
	}

	kill(): void {
		const proc = this.process;
		if (!proc) return;

		try {
			proc.kill("SIGTERM");
		} catch {
			// ignore
		}

		setTimeout(() => {
			try {
				proc.kill("SIGKILL");
			} catch {
				// ignore
			}
		}, KILL_TIMEOUT_MS);

		this.process = null;
	}

	private handleUnexpectedExit(): void {
		// In a future iteration we could restart the backend. For now, log and
		// let the user know that the agent backend is gone.
		this.process = null;
		this.resolvedUrl = null;
		this.urlPromise = null;
	}
}

const backendManager = new BackendManager();

/**
 * Determine how to start the backend.
 * In dev: runs the coding-agent CLI through Bun with the local extensions dir.
 * In packaged: uses `process.resourcesPath` where electron-builder places extraResources.
 */
function getBackendCommand(): { command: string; args: string[] } {
	const isPackaged = app.isPackaged;
	const extensionsDir = isPackaged
		? join(process.resourcesPath, "extensions")
		: join(__dirname, "..", "..", "..", "extensions");
	const args = ["--web", "--no-extensions", "-e", extensionsDir];

	if (isPackaged) {
		return { command: join(process.resourcesPath, "pi"), args };
	}
	return {
		command: "bun",
		args: [join(__dirname, "..", "..", "..", "coding-agent", "src", "cli.ts"), ...args],
	};
}

/**
 * Wait for the backend healthcheck endpoint to respond.
 */
async function waitForBackend(url: string, timeoutMs: number, intervalMs: number): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(`${url}/rpc`, { method: "HEAD" });
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
 * Create the main BrowserWindow.
 */
function createWindow(): void {
	const indexPath = join(__dirname, "..", "..", "frontend", "dist", "index.html");

	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 800,
		minHeight: 600,
		webPreferences: {
			preload: join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
		},
		show: false,
	});

	mainWindow.loadURL(`file://${indexPath}`);

	// Forward renderer console messages to the main process log so we can
	// diagnose iframe/subagents frontend issues without needing DevTools.
	mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
		const levelLabel = ["debug", "info", "warn", "error"][level] ?? "log";
		console.log(`[renderer:${levelLabel}] ${sourceId ?? ""}:${line ?? ""} ${message}`);
	});

	// Open DevTools automatically during development so errors in the renderer
	// and inside the subagent iframes are visible immediately.
	mainWindow.webContents.openDevTools({ mode: "detach" });

	mainWindow.once("ready-to-show", () => {
		if (!mainWindow) return;
		mainWindow.show();
		if (process.platform === "darwin") {
			app.dock.show();
		}
		mainWindow.focus();
		console.log("[electron] Window shown and focused");
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

ipcMain.handle("get-backend-url", () => backendManager.getUrl());
ipcMain.handle("choose-project-directory", async () => {
	const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
		properties: ["openDirectory", "createDirectory"],
	});
	return result.canceled ? null : result.filePaths[0] ?? null;
});

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	console.error("[electron] Another Pi Dashboard instance is already running. Exiting.");
	app.quit();
	process.exit(0);
}

app.on("second-instance", () => {
	console.log("[electron] Second instance detected; focusing existing window");
	if (mainWindow) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		if (!mainWindow.isVisible()) {
			mainWindow.show();
		}
		if (process.platform === "darwin") {
			app.dock.show();
		}
		mainWindow.focus();
	}
});

// App lifecycle
app.whenReady().then(async () => {
	try {
		console.log("[electron] Starting dashboard backend...");
		backendManager.start();
		const url = await backendManager.getUrl();
		console.log(`[electron] Backend URL resolved: ${url}`);
		await waitForBackend(url, HEALTHCHECK_TIMEOUT_MS, HEALTHCHECK_INTERVAL_MS);
		console.log("[electron] Backend is ready; creating window");
		createWindow();
	} catch (err) {
		console.error("[electron] Failed to start dashboard:", err);
		app.quit();
	}
});

app.on("before-quit", () => {
	backendManager.kill();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (mainWindow === null) {
		createWindow();
	}
});
