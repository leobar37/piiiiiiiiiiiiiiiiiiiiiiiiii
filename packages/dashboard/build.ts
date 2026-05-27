import { join } from "node:path";

const ENTRY = join(import.meta.dir, "src", "index.ts");
const CLI_ENTRY = join(import.meta.dir, "src", "cli.ts");
const OUT_DIR = join(import.meta.dir, "dist");
const BINARY_OUT = join(OUT_DIR, "pi-web-binary");

async function build() {
	// Build library
	const result = await Bun.build({
		entrypoints: [ENTRY],
		outdir: OUT_DIR,
		target: "bun",
		format: "esm",
		naming: "index.js",
		external: ["@earendil-works/*", "@local/*", "@orpc/*", "vite"],
	});

	if (!result.success) {
		console.error("Build failed:", result.logs);
		process.exit(1);
	}

	console.log(`Built → ${join(OUT_DIR, "index.js")}`);

	// Build CLI
	const cliResult = await Bun.build({
		entrypoints: [CLI_ENTRY],
		outdir: OUT_DIR,
		target: "bun",
		format: "esm",
		naming: "cli.js",
		external: ["@earendil-works/*", "@local/*", "@orpc/*", "vite"],
	});

	if (!cliResult.success) {
		console.error("CLI build failed:", cliResult.logs);
		process.exit(1);
	}

	console.log(`Built → ${join(OUT_DIR, "cli.js")}`);
}

async function buildBinary() {
	console.log("Compiling standalone binary...");

	const result = await Bun.build({
		entrypoints: [CLI_ENTRY],
		compile: {
			outfile: BINARY_OUT,
		},
		minify: true,
		bytecode: true,
		external: ["@earendil-works/*", "@local/*", "@orpc/*", "vite"],
	});

	if (!result.success) {
		console.error("Binary compilation failed:", result.logs);
		process.exit(1);
	}

	console.log(`Compiled binary → ${BINARY_OUT}`);
}

const isWatch = process.argv.includes("--watch");
const isBinary = process.argv.includes("--binary");

if (isBinary) {
	await buildBinary();
} else if (isWatch) {
	console.log("Watching for changes...");
	await build();
	const watcher = Bun.watch(join(import.meta.dir, "src"), { recursive: true }, async () => {
		console.log("Rebuilding...");
		await build();
	});
	await watcher;
} else {
	await build();
}
