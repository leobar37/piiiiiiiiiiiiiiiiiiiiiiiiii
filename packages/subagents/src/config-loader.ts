import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { transform } from "esbuild";
import { SubAgentConfigManager } from "./config-manager.js";
import type { SubAgentProjectConfig } from "./types.js";

export const PI_CONFIG_FILE = "config.pi.ts";

export interface LoadConfigResult {
	config: SubAgentProjectConfig;
	path: string;
}

export interface LoadConfigOptions {
	cwd: string;
	/**
	 * Whether to search upward from cwd for the config file.
	 * If false, only checks cwd directly.
	 * @default true
	 */
	searchUpward?: boolean;
}

/**
 * Find config.pi.ts starting from cwd, optionally searching upward.
 */
export function findConfigPath(cwd: string, searchUpward = true): string | null {
	let current = resolve(cwd);
	const root = resolve("/");

	while (true) {
		const configPath = join(current, PI_CONFIG_FILE);
		if (existsSync(configPath)) {
			return configPath;
		}
		if (!searchUpward || current === root) {
			return null;
		}
		const parent = resolve(current, "..");
		if (parent === current) {
			return null;
		}
		current = parent;
	}
}

/**
 * Load and evaluate a config.pi.ts file.
 *
 * Uses esbuild to transpile the TypeScript module to a temporary file,
 * then dynamically imports it. This allows the config to use TypeScript
 * syntax, imports from node_modules, and dynamic logic.
 */
export async function loadConfig(options: LoadConfigOptions): Promise<LoadConfigResult | null> {
	const configPath = findConfigPath(options.cwd, options.searchUpward ?? true);
	if (!configPath) {
		return null;
	}

	const configDir = resolve(configPath, "..");
	const tempFile = await transpileToTemp(configPath);

	try {
		const mod = await import(tempFile);

		const exported = mod.default;
		if (!exported) {
			throw new Error(`Config file ${configPath} must export a default export`);
		}

		let config: SubAgentProjectConfig;

		if (typeof exported === "function") {
			const ctx = { cwd: configDir, env: process.env };
			const result = await exported(ctx);
			if (!result || typeof result !== "object" || Array.isArray(result)) {
				throw new Error(`Config file ${configPath} default export function must return a plain object`);
			}
			config = result;
		} else if (typeof exported === "object" && !Array.isArray(exported)) {
			config = exported;
		} else {
			throw new Error(`Config file ${configPath} must export a default object or function returning an object`);
		}

		return { config, path: configPath };
	} finally {
		// Best-effort cleanup of the temp file and its directory
		try {
			const tempDir = resolve(tempFile, "..");
			rmSync(tempDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	}
}

/**
 * Load a SubAgentConfigManager from config.pi.ts, falling back to defaults
 * if no config file is found.
 */
export async function loadConfigManager(cwd: string): Promise<SubAgentConfigManager> {
	const result = await loadConfig({ cwd });
	if (result) {
		return SubAgentConfigManager.fromConfig(result.config);
	}
	return SubAgentConfigManager.defaultsOnly();
}

/**
 * Transpile a TypeScript config file to a temporary JS file using esbuild.
 * Returns the path to the temporary file.
 */
async function transpileToTemp(configPath: string): Promise<string> {
	const { readFileSync } = await import("node:fs");
	const source = readFileSync(configPath, "utf8");

	const result = await transform(source, {
		loader: "ts",
		format: "esm",
		target: "es2022",
		platform: "node",
		sourcefile: configPath,
		minify: false,
	});

	const tempDir = mkdtempSync(join(tmpdir(), "pi-config-"));
	const tempFile = join(tempDir, "config.pi.js");
	writeFileSync(tempFile, result.code, "utf8");

	return tempFile;
}
