#!/usr/bin/env node
/**
 * pi-web CLI entry point
 *
 * Usage:
 *   pi-web              Start web dashboard on default port (9393)
 *   pi-web --port 8080  Start on custom port
 *   pi-web --host 0.0.0.0  Listen on all interfaces
 */

import { parseArgs } from "./cli-args.js";
import { createSessionServer } from "./session-server.js";

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const port = args.port ?? 9393;
	const host = args.host ?? "127.0.0.1";

	console.log(`Starting pi-web on http://${host}:${port}`);

	const server = createSessionServer({
		port,
		host,
		sessionsDir: args.sessionsDir,
	});

	await server.start();

	console.log(`pi-web running at ${server.url}`);
	console.log("Press Ctrl+C to stop");

	// Keep alive
	await new Promise(() => {});
}

main().catch((err) => {
	console.error("Failed to start pi-web:", err);
	process.exit(1);
});
