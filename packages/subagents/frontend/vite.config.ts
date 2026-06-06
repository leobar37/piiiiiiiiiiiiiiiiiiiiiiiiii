import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ command }) => ({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"/src/main.tsx": command === "serve" ? "/src/dev-main.tsx" : "/src/main.tsx",
			"@subagents/contract": path.resolve(__dirname, "../src/api/contract.ts"),
		},
	},
	server: {
		proxy: {
			"/rpc": "http://127.0.0.1:9393",
			"/events": "http://127.0.0.1:9393",
		},
	},
	build: {
		outDir: "dist",
	},
	// Ensure MSW's Service Worker is served correctly in dev
	publicDir: "public",
}));
