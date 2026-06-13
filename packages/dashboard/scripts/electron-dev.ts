import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import process from "node:process";

const HOST = "127.0.0.1";
const START_PORT = 5173;
const MAX_PORT = 5199;

async function isPortAvailable(port: number): Promise<boolean> {
	const server = createServer();
	server.unref();

	return new Promise((resolve) => {
		server.once("error", () => {
			resolve(false);
		});
		server.listen({ host: HOST, port }, () => {
			server.close(() => {
				resolve(true);
			});
		});
	});
}

async function findPort(): Promise<number> {
	for (let port = START_PORT; port <= MAX_PORT; port += 1) {
		if (await isPortAvailable(port)) {
			return port;
		}
	}
	throw new Error(`No available renderer port found between ${START_PORT} and ${MAX_PORT}`);
}

async function runCommand(command: string, args: string[], cwd?: string): Promise<void> {
	const child = spawn(command, args, {
		stdio: "inherit",
		shell: false,
		cwd,
	});

	const [code, signal] = (await once(child, "exit")) as [number | null, NodeJS.Signals | null];
	if (code !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed with ${signal ?? `code ${code}`}`);
	}
}

function spawnProcess(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): ChildProcess {
	return spawn(command, args, {
		stdio: "inherit",
		shell: false,
		cwd: options?.cwd,
		env: {
			...process.env,
			...options?.env,
		},
	});
}

function stopProcess(child: ChildProcess): void {
	if (child.exitCode !== null || child.signalCode !== null) {
		return;
	}
	child.kill("SIGTERM");
}

async function main(): Promise<void> {
	const port = await findPort();
	const rendererUrl = `http://${HOST}:${port}`;
	console.log(`[electron-dev] Renderer URL: ${rendererUrl}`);

	await runCommand("bun", ["x", "vite", "build"], "../subagents/frontend");
	await runCommand("bun", ["run", "build"], "../subagents");
	await runCommand("bun", ["run", "build"]);
	await runCommand("bun", ["run", "build:electron"]);

	const renderer = spawnProcess("bun", ["run", "dev", "--", "--host", HOST, "--port", String(port), "--strictPort"], {
		cwd: "frontend",
	});
	const electron = spawnProcess("electron", ["electron/dist/main.cjs"], {
		env: {
			PI_DASHBOARD_RENDERER_URL: rendererUrl,
		},
	});

	const stopAll = () => {
		stopProcess(renderer);
		stopProcess(electron);
	};

	process.once("SIGINT", () => {
		stopAll();
		process.exit(130);
	});
	process.once("SIGTERM", () => {
		stopAll();
		process.exit(143);
	});

	const [name, code, signal] = await Promise.race([
		once(renderer, "exit").then(([code, signal]) => ["renderer", code, signal] as const),
		once(electron, "exit").then(([code, signal]) => ["electron", code, signal] as const),
	]);

	stopAll();

	if (code !== 0) {
		throw new Error(`${name} exited with ${signal ?? `code ${code}`}`);
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[electron-dev] ${message}`);
	process.exit(1);
});
