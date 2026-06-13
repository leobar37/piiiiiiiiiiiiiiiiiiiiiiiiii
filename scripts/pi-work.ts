#!/usr/bin/env bun
/**
 * pi-work: run this fork of pi in TUI mode from any directory,
 * using local packages but respecting globally installed extensions.
 * Unlike pi-dev, this does NOT load local extensions from packages/extensions,
 * avoiding conflicts with global extensions (e.g. @capyup/pi-goal, @juicesharp/rpiv-todo).
 */

import { realpathSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = realpathSync(join(import.meta.dirname, ".."));
const CLI_ENTRY = join(REPO_ROOT, "packages", "coding-agent", "src", "cli.ts");
const SUBAGENTS_DIR = join(REPO_ROOT, "packages", "subagents");
const SUBAGENTS_ENTRY = join(SUBAGENTS_DIR, "src", "index.ts");
const SUBAGENTS_OUT_DIR = join(SUBAGENTS_DIR, "dist");

const args = process.argv.slice(2);

async function buildSubagentsBackend() {
	const result = await Bun.build({
		entrypoints: [SUBAGENTS_ENTRY],
		outdir: SUBAGENTS_OUT_DIR,
		target: "bun",
		format: "esm",
		external: [
			"@earendil-works/pi-agent-core",
			"@earendil-works/pi-ai",
			"@earendil-works/pi-ai/oauth",
			"@earendil-works/pi-coding-agent",
			"@earendil-works/pi-tui",
			"@local/pi-logger",
			"typebox",
			"typebox/compile",
			"typebox/value",
			"zod",
			"zod/v4",
			"zod/v4/core",
		],
		naming: "index.js",
	});

	if (!result.success) {
		console.error("Subagents backend build failed:", result.logs);
		process.exit(1);
	}

	console.log(`Built → ${join(SUBAGENTS_OUT_DIR, "index.js")}`);
}

console.log("[pi-work] Starting Pi TUI (local packages, global extensions)");

// Build only the subagents backend (no frontend, since TUI mode doesn't need it).
await buildSubagentsBackend();

// No -e EXT_DIR here, so only globally installed extensions are loaded.
// No --no-extensions either, so global extension discovery works normally.
// No --web, so TUI mode is used (same as the original pi command).
const bunArgs = ["run", CLI_ENTRY, ...args];

const proc = Bun.spawn(["bun", ...bunArgs], {
	stdio: ["inherit", "inherit", "inherit"],
	env: {
		...process.env,
		LION_AUTO_ACTIVATE: "true",
	},
});

const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
if (process.platform !== "win32") {
	signals.push("SIGHUP");
}

for (const signal of signals) {
	process.on(signal, () => {
		proc.kill(signal);
	});
}

await proc.exited;
process.exit(proc.exitCode ?? 0);
