import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		proxy: {
			"/api": "http://127.0.0.1:9393",
			"/events": "http://127.0.0.1:9393",
		},
	},
	build: {
		outDir: "dist",
	},
	// Ensure MSW's Service Worker is served correctly in dev
	publicDir: "public",
});

