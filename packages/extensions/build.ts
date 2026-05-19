#!/usr/bin/env bun
/**
 * Pi Toolkit Build — Standard build script for Pi extension toolkits.
 *
 * Builds all extension entry points (src/extensions/{name}/index.ts) to bundled .js
 * files in dist/. Each extension becomes dist/{name}.js.
 *
 * Pi packages and typebox are left external (resolved by the host agent).
 * Relative imports within src/ are inlined into each bundle.
 *
 * Usage:
 *   bun run build.ts           # build once
 *   bun run build.ts --watch   # watch and rebuild on changes
 *
 * Configurable via package.json "pi.build":
 *   {
 *     "pi": {
 *       "extensions": ["./dist"],
 *       "build": {
 *         "srcDir": "./src",
 *         "outDir": "./dist",
 *         "target": "bun"
 *       }
 *     }
 *   }
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const PKG_ROOT = import.meta.dir;
const PKG_JSON = join(PKG_ROOT, "package.json");

function loadBuildConfig() {
	try {
		const pkg = JSON.parse(readFileSync(PKG_JSON, "utf-8"));
		const buildConfig = pkg.pi?.build ?? {};
		return {
			srcDir: resolve(PKG_ROOT, buildConfig.srcDir ?? "./src"),
			outDir: resolve(PKG_ROOT, buildConfig.outDir ?? "./dist"),
			target: (buildConfig.target ?? "bun") as "bun" | "node",
		};
	} catch {
		return { srcDir: join(PKG_ROOT, "src"), outDir: join(PKG_ROOT, "dist"), target: "bun" as const };
	}
}

const CONFIG = loadBuildConfig();

const EXTERNAL = [
	"@earendil-works/pi-agent-core",
	"@earendil-works/pi-ai",
	"@earendil-works/pi-ai/oauth",
	"@earendil-works/pi-tui",
	"@earendil-works/pi-coding-agent",
	"@mariozechner/pi-agent-core",
	"@mariozechner/pi-ai",
	"@mariozechner/pi-ai/oauth",
	"@mariozechner/pi-tui",
	"@mariozechner/pi-coding-agent",
	"@local/pi-subagents",
	"typebox",
	"typebox/compile",
	"typebox/value",
	"@sinclair/typebox",
	"@sinclair/typebox/compile",
	"@sinclair/typebox/value",
];

/**
 * Discover extension entry points: src/extensions/<name>/index.ts
 */
function discoverExtensionEntrypoints(dir: string): Array<{ entrypoint: string; name: string }> {
	const entries: Array<{ entrypoint: string; name: string }> = [];
	const extensionsDir = join(dir, "extensions");

	if (!existsSync(extensionsDir)) {
		return entries;
	}

	for (const name of readdirSync(extensionsDir)) {
		const extDir = join(extensionsDir, name);
		if (!statSync(extDir).isDirectory()) continue;

		const indexFile = join(extDir, "index.ts");
		if (existsSync(indexFile)) {
			entries.push({ entrypoint: indexFile, name });
		}
	}

	return entries;
}

/**
 * Collect all local source files for watch mode (recursive)
 */
function collectWatchFiles(dir: string): string[] {
	const files: string[] = [];
	if (!existsSync(dir)) return files;

	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) {
			files.push(...collectWatchFiles(full));
		} else if (st.isFile() && name.endsWith(".ts")) {
			files.push(full);
		}
	}
	return files;
}

async function build() {
	const extensions = discoverExtensionEntrypoints(CONFIG.srcDir);

	if (extensions.length === 0) {
		console.log(`No extension entrypoints found in ${join(CONFIG.srcDir, "extensions")}`);
		return;
	}

	if (!existsSync(CONFIG.outDir)) {
		mkdirSync(CONFIG.outDir, { recursive: true });
	}

	let built = 0;
	for (const { entrypoint, name } of extensions) {
		// Build to a temp dir, then rename to dist/<name>.js
		// Bun.build with outdir creates the file at outdir/relative(entrypoint)
		// We use naming to control the output filename
		const result = await Bun.build({
			entrypoints: [entrypoint],
			outdir: CONFIG.outDir,
			target: CONFIG.target,
			format: "esm",
			sourcemap: "inline",
			external: EXTERNAL,
			naming: {
				entry: `${name}.js`,
				chunk: `${name}-[name].[ext]`,
			},
		});

		if (!result.success) {
			for (const log of result.logs) {
				console.error(`[${name}]`, log);
			}
			process.exit(1);
		}
		built++;
	}

	console.log(`Built ${built} extensions to ${CONFIG.outDir}`);
}

// Watch mode: naive re-build on interval (fs.watch is flaky across platforms)
if (process.argv.includes("--watch")) {
	console.log("Watching for changes... (Ctrl+C to stop)");
	await build();
	let lastMtimes = new Map<string, number>();
	const watchDirs = [join(CONFIG.srcDir, "extensions"), join(CONFIG.srcDir, "shared"), join(CONFIG.srcDir, "lib")];

	setInterval(async () => {
		let changed = false;
		for (const watchDir of watchDirs) {
			if (!existsSync(watchDir)) continue;
			for (const file of collectWatchFiles(watchDir)) {
				const mtime = statSync(file).mtimeMs;
				if (lastMtimes.get(file) !== mtime) {
					lastMtimes.set(file, mtime);
					changed = true;
				}
			}
		}
		if (changed) {
			console.log("\n[watch] changes detected, rebuilding...");
			await build();
		}
	}, 1000);
} else {
	await build();
}
