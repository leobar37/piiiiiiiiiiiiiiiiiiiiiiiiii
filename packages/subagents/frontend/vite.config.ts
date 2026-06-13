import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const backendUrl = process.env.PI_SUBAGENTS_BACKEND_URL ?? "http://127.0.0.1:9393";

export default defineConfig({
	plugins: [
		tailwindcss(),
		tanstackStart({
			spa: {
				enabled: true,
				prerender: {
					outputPath: "/index.html",
				},
			},
		}),
		react(),
	],
	resolve: {
		alias: {
			"@subagents/contract": path.resolve(__dirname, "../src/api/contract.ts"),
		},
	},
	server: {
		proxy: {
			"/rpc": backendUrl,
			"/events": backendUrl,
		},
	},
	build: {
		outDir: "dist",
	},
	publicDir: "public",
});
