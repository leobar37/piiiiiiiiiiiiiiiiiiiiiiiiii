#!/usr/bin/env bun
/**
 * pi-dev: run this fork of pi in web mode from any directory,
 * loading the vendored extensions from packages/extensions.
 */

import { realpathSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

const REPO_ROOT = realpathSync(join(import.meta.dirname, ".."));
const CLI_ENTRY = join(REPO_ROOT, "packages", "coding-agent", "src", "cli.ts");
const SUBAGENTS_DIR = join(REPO_ROOT, "packages", "subagents");
const SUBAGENTS_FRONTEND_DIR = join(SUBAGENTS_DIR, "frontend");
const EXT_DIR = join(REPO_ROOT, "packages", "extensions");
const DASHBOARD_URL_PATTERN = /\[lion\] dashboard at (https?:\/\/[^\s]+)/;
const VITE_URL_PATTERN = /Local:\s+(https?:\/\/[^\s]+)/;

const rawArgs = process.argv.slice(2);
const devMode = rawArgs.includes("--dev");
const args = rawArgs.filter((arg) => arg !== "--web-only" && arg !== "--dev");

function getAvailablePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() => {
				if (address && typeof address === "object") {
					resolve(address.port);
				} else {
					reject(new Error("Failed to allocate a local port"));
				}
			});
		});
	});
}

function runBuild(command: string[], cwd: string): void {
	const proc = Bun.spawnSync(command, {
		cwd,
		stdio: ["inherit", "inherit", "inherit"],
	});
	if (proc.exitCode !== 0) {
		process.exit(proc.exitCode ?? 1);
	}
}

function openBrowser(url: string): void {
	const command =
		process.platform === "darwin"
			? ["open", url]
			: process.platform === "win32"
				? ["cmd", "/c", "start", "", url]
				: ["xdg-open", url];

	Bun.spawn(command, {
		stdout: "ignore",
		stderr: "ignore",
	});
}

async function forwardOutput(
	stream: ReadableStream<Uint8Array> | null,
	write: (chunk: Uint8Array) => boolean,
	onText: (text: string) => void,
): Promise<void> {
	if (!stream) return;

	const decoder = new TextDecoder();
	const reader = stream.getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			write(value);
			onText(decoder.decode(value, { stream: true }));
		}
		const remaining = decoder.decode();
		if (remaining) {
			onText(remaining);
		}
	} finally {
		reader.releaseLock();
	}
}

console.log("[pi-dev] Starting Pi web interface");

if (!devMode) {
	// Build subagents frontend first because HttpServerTransport serves its static files.
	runBuild(["bun", "run", "build"], SUBAGENTS_FRONTEND_DIR);
}

// Build subagents because extensions keep @local/pi-subagents external.
runBuild(["bun", "run", "build"], SUBAGENTS_DIR);

// Build extensions so external dependencies are bundled and imports resolve.
runBuild(["bun", "run", "build"], EXT_DIR);

// --no-extensions disables global extension discovery so we only load the
// vendored extensions from packages/extensions, avoiding conflicts with
// user-installed global extensions (e.g. @capyup/pi-goal, @juicesharp/rpiv-todo).
const bunArgs = ["run", CLI_ENTRY, "--no-extensions", "-e", EXT_DIR, "--web", ...args];

const backendPort = devMode ? await getAvailablePort() : undefined;
const backendUrl = backendPort ? `http://127.0.0.1:${backendPort}` : undefined;
const childProcesses: Array<ReturnType<typeof Bun.spawn>> = [];

let viteUrl: string | undefined;
let backendReadyUrl: string | undefined;
let browserOpened = false;

function maybeOpenBrowser(): void {
	if (browserOpened) return;
	const url = devMode ? viteUrl : backendReadyUrl;
	if (!url) return;
	if (devMode && !backendReadyUrl) return;

	browserOpened = true;
	console.log(`[pi-dev] Web interface: ${url}`);
	openBrowser(url);
}

let viteOutputBuffer = "";
function detectViteUrl(text: string): void {
	if (!devMode || viteUrl) return;

	viteOutputBuffer = `${viteOutputBuffer}${text}`.slice(-4096);
	const match = viteOutputBuffer.match(VITE_URL_PATTERN);
	if (!match) return;

	viteUrl = match[1];
	maybeOpenBrowser();
}

if (devMode) {
	if (!backendUrl) {
		throw new Error("Failed to configure the frontend dev proxy backend URL");
	}

	const viteProc = Bun.spawn(["bun", "run", "dev", "--", "--host", "127.0.0.1"], {
		cwd: SUBAGENTS_FRONTEND_DIR,
		stdout: "pipe",
		stderr: "pipe",
		stdin: "ignore",
		env: {
			...process.env,
			PI_SUBAGENTS_BACKEND_URL: backendUrl,
		},
	});
	childProcesses.push(viteProc);
	void forwardOutput(viteProc.stdout, (chunk) => process.stdout.write(chunk), detectViteUrl);
	void forwardOutput(viteProc.stderr, (chunk) => process.stderr.write(chunk), detectViteUrl);
}

const proc = Bun.spawn(["bun", ...bunArgs], {
	stdout: "pipe",
	stderr: "pipe",
	stdin: "inherit",
	env: {
		...process.env,
		LION_AUTO_ACTIVATE: "true",
		...(backendPort ? { PI_SUBAGENTS_DASHBOARD_PORT: String(backendPort) } : {}),
	},
});
childProcesses.push(proc);

let dashboardOutputBuffer = "";
function detectDashboardUrl(text: string): void {
	if (backendReadyUrl) return;

	dashboardOutputBuffer = `${dashboardOutputBuffer}${text}`.slice(-4096);
	const match = dashboardOutputBuffer.match(DASHBOARD_URL_PATTERN);
	if (!match) return;

	backendReadyUrl = match[1];
	maybeOpenBrowser();
}

const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
if (process.platform !== "win32") {
	signals.push("SIGHUP");
}

for (const signal of signals) {
	process.on(signal, () => {
		for (const childProcess of childProcesses) {
			childProcess.kill(signal);
		}
	});
}

await Promise.all([
	forwardOutput(proc.stdout, (chunk) => process.stdout.write(chunk), detectDashboardUrl),
	forwardOutput(proc.stderr, (chunk) => process.stderr.write(chunk), detectDashboardUrl),
	proc.exited,
]);

for (const childProcess of childProcesses) {
	if (childProcess !== proc) {
		childProcess.kill();
	}
}

process.exit(proc.exitCode ?? 0);
