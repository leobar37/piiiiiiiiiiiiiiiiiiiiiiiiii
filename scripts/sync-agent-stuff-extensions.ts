#!/usr/bin/env bun
/**
 * Clone mitsuhiko/agent-stuff into a temp directory, copy its extensions
 * into packages/extensions/src, then remove the temp clone.
 */

import { mkdtempSync, rmSync, existsSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_URL = "https://github.com/mitsuhiko/agent-stuff.git";
const DEST_DIR = resolve(import.meta.dir, "..", "packages", "extensions", "src");

function run(cmd: string, args: string[], cwd?: string) {
	const proc = Bun.spawnSync([cmd, ...args], { cwd, stdout: "inherit", stderr: "inherit" });
	if (proc.exitCode !== 0) {
		throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
	}
}

function main() {
	const tmpDir = mkdtempSync(join(tmpdir(), "agent-stuff-"));
	try {
		console.log(`Cloning ${REPO_URL} into ${tmpDir}...`);
		run("git", ["clone", "--depth", "1", REPO_URL, tmpDir]);

		const src = join(tmpDir, "extensions");
		if (!existsSync(src)) {
			throw new Error(`No extensions directory found in cloned repo`);
		}

		if (existsSync(DEST_DIR)) {
			rmSync(DEST_DIR, { recursive: true, force: true });
		}
		mkdirSync(DEST_DIR, { recursive: true });
		cpSync(src, DEST_DIR, { recursive: true, force: true });

		console.log(`Extensions copied to ${DEST_DIR}`);
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
		console.log(`Cleaned up temp clone ${tmpDir}`);
	}
}

main();
