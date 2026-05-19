#!/usr/bin/env bun
/**
 * pi-dev: run this fork of pi in development mode from any directory,
 * loading the vendored extensions from packages/extensions.
 */

import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve repo root from this script's location (scripts/ -> repo root)
const REPO_ROOT = realpathSync(join(__dirname, ".."));
const CLI_ENTRY = join(REPO_ROOT, "packages", "coding-agent", "src", "cli.ts");
const EXT_DIR = join(REPO_ROOT, "packages", "extensions");

const args = process.argv.slice(2);

// Build extensions first so external dependencies are bundled and imports resolve.
const buildProc = Bun.spawnSync(["bun", "run", "build"], {
	cwd: EXT_DIR,
	stdio: ["inherit", "inherit", "inherit"],
});
if (buildProc.exitCode !== 0) {
	process.exit(buildProc.exitCode ?? 1);
}

const extensionFlag = "-e";
const extensionPath = EXT_DIR;

// Prepend the extension path so user args still win for duplicates
const bunArgs = ["run", CLI_ENTRY, extensionFlag, extensionPath, ...args];

const proc = Bun.spawnSync(["bun", ...bunArgs], {
	stdio: ["inherit", "inherit", "inherit"],
	env: process.env,
});

process.exit(proc.exitCode ?? 0);
