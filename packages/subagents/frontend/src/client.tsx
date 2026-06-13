import { StartClient } from "@tanstack/react-start/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";

async function startClient() {
	if (import.meta.env.DEV) {
		const { worker } = await import("./mocks/browser.ts");
		try {
			await worker.start({ onUnhandledRequest: "bypass" });
		} catch (err) {
			console.warn("[dev] MSW worker failed to start:", err);
		}
	}

	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>,
	);
}

void startClient();
