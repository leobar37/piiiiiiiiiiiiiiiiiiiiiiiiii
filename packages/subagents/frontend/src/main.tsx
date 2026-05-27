import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

async function enableMocking(): Promise<void> {
	const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
	if (!isDev) return;
	const { worker } = await import("./mocks/browser.ts");
	await worker.start({
		onUnhandledRequest: "bypass",
	});
}

enableMocking().then(() => {
	const root = document.getElementById("root");
	if (root) {
		createRoot(root).render(
			<StrictMode>
				<App />
			</StrictMode>,
		);
	}
});
