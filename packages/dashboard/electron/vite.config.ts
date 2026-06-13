import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
	build: {
		lib: {
			entry: {
				main: resolve(__dirname, "main.ts"),
				preload: resolve(__dirname, "preload.ts"),
			},
			formats: ["cjs"],
			fileName: (_format, entryName) => `${entryName}.cjs`,
		},
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: true,
		minify: false,
		rollupOptions: {
			external: ["electron", "node:child_process", "node:path", "node:url", "node:fs", "node:os"],
			output: {
				inlineDynamicImports: false,
			},
		},
	},
});
