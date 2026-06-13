/**
 * Main App — sidebar + chat view layout.
 *
 * Hash is the single source of truth for routing.
 */

import { useState, useEffect } from "react";
import "react-grab";
import { Sidebar } from "./components/Sidebar.js";
import { ChatView } from "./components/ChatView.js";
import { ProjectRuntimeProvider, SessionRuntimeProvider } from "./store/index.js";

const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
const GrabProvider = isDev
	? ({ children }: { children: React.ReactNode }) => <>{children}</>
	: ({ children }: { children: React.ReactNode }) => <>{children}</>;

function getHashSessionId(): string | null {
	const hash = window.location.hash;
	return hash.startsWith("#/session/") ? hash.slice("#/session/".length) : null;
}

function useHashSessionId(): string | null {
	const [sessionId, setSessionId] = useState(() => getHashSessionId());

	useEffect(() => {
		const handler = () => setSessionId(getHashSessionId());
		window.addEventListener("hashchange", handler);
		return () => window.removeEventListener("hashchange", handler);
	}, []);

	return sessionId;
}

export function navigateToSession(id: string | null) {
	window.location.hash = id ? `#/session/${id}` : "#/";
}

function AppContent() {
	const sessionId = useHashSessionId();

	return (
		<div className="h-screen flex bg-bg-base text-text-primary overflow-hidden">
			<Sidebar activeSessionId={sessionId} />
			<main className="flex-1 flex flex-col min-w-0">
				<ChatView sessionId={sessionId} />
			</main>
		</div>
	);
}

export default function App() {
	return (
		<SessionRuntimeProvider>
			<ProjectRuntimeProvider>
				<GrabProvider>
					<AppContent />
				</GrabProvider>
			</ProjectRuntimeProvider>
		</SessionRuntimeProvider>
	);
}
