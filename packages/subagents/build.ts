import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ENTRY = join(import.meta.dir, "src", "index.ts");
const OUT_DIR = join(import.meta.dir, "dist");
const FRONTEND_DIR = join(import.meta.dir, "frontend");
const SKILLS_DIR = join(import.meta.dir, "skills");
const DIST_SKILLS_DIR = join(OUT_DIR, "skills");
const EXTERNAL = [
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
];

async function buildFrontend() {
	const proc = Bun.spawn(["bun", "run", "build"], {
		cwd: FRONTEND_DIR,
		stdout: "inherit",
		stderr: "inherit",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		console.error(`Frontend build failed with exit code ${exitCode}`);
		process.exit(exitCode);
	}
}

async function build() {
	await buildFrontend();

	const result = await Bun.build({
		entrypoints: [ENTRY],
		outdir: OUT_DIR,
		target: "bun",
		format: "esm",
		external: EXTERNAL,
		naming: "index.js",
	});

	if (!result.success) {
		console.error("Build failed:", result.logs);
		process.exit(1);
	}

	if (existsSync(SKILLS_DIR)) {
		rmSync(DIST_SKILLS_DIR, { recursive: true, force: true });
		cpSync(SKILLS_DIR, DIST_SKILLS_DIR, { recursive: true });
	}

	console.log(`Built → ${join(OUT_DIR, "index.js")}`);
}

const isWatch = process.argv.includes("--watch");

if (isWatch) {
	console.log("Watching for changes...");
	await build();
	const srcWatcher = Bun.watch(join(import.meta.dir, "src"), { recursive: true }, async () => {
		console.log("Rebuilding...");
		await build();
	});
	const skillsWatcher = existsSync(SKILLS_DIR)
		? Bun.watch(SKILLS_DIR, { recursive: true }, async () => {
				console.log("Rebuilding...");
				await build();
			})
		: undefined;
	await Promise.all([srcWatcher, skillsWatcher].filter((watcher) => watcher !== undefined));
} else {
	await build();
}
