import { useEffect, useState } from "react";
import { ConnectionStatus } from "./components/ConnectionStatus.js";
import { EventLog } from "./components/EventLog.js";
import { EventStream } from "./components/EventStream.js";
import { OrchestratorPanel } from "./components/OrchestratorPanel.js";
import { SessionList } from "./components/SessionList.js";
import { SessionView } from "./components/SessionView.js";

type View = "dashboard" | "sessions" | "session";

export default function App() {
	const [view, setView] = useState<View>("dashboard");
	const [sessionId, setSessionId] = useState<string | null>(null);

	// Handle URL routing
	useEffect(() => {
		const path = window.location.pathname;
		if (path === "/sessions") {
			setView("sessions");
		} else if (path.startsWith("/session/")) {
			const id = path.slice("/session/".length);
			setSessionId(id);
			setView("session");
		} else {
			setView("dashboard");
		}
	}, []);

	function navigateTo(newView: View, id?: string) {
		setView(newView);
		if (id) setSessionId(id);

		switch (newView) {
			case "dashboard":
				window.history.pushState({}, "", "/");
				break;
			case "sessions":
				window.history.pushState({}, "", "/sessions");
				break;
			case "session":
				if (id) window.history.pushState({}, "", `/session/${id}`);
				break;
		}
	}

	return (
		<div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
			<header className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
				<div className="flex items-center gap-4">
					<h1
						className="text-lg font-bold tracking-tight cursor-pointer hover:text-gray-300"
						onClick={() => navigateTo("dashboard")}
					>
						Pi Web
					</h1>
					<nav className="flex gap-2">
						<button
							onClick={() => navigateTo("dashboard")}
							className={`text-sm px-2 py-1 rounded ${
								view === "dashboard"
									? "bg-gray-800 text-gray-100"
									: "text-gray-500 hover:text-gray-300"
							}`}
						>
							Dashboard
						</button>
						<button
							onClick={() => navigateTo("sessions")}
							className={`text-sm px-2 py-1 rounded ${
								view === "sessions" || view === "session"
									? "bg-gray-800 text-gray-100"
									: "text-gray-500 hover:text-gray-300"
							}`}
						>
							Sessions
						</button>
					</nav>
				</div>
				<span className="text-xs text-gray-500">
					{view === "dashboard" && "Real-time orchestrator events"}
					{view === "sessions" && "Manage Pi sessions"}
					{view === "session" && "View session details"}
				</span>
			</header>

			{view === "dashboard" && (
				<>
					<ConnectionStatus />
					<OrchestratorPanel />
					<main className="flex-1 flex flex-col min-h-0">
						<EventLog />
					</main>
					<EventStream />
				</>
			)}

			{view === "sessions" && (
				<main className="flex-1 flex flex-col min-h-0">
					<SessionList />
				</main>
			)}

			{view === "session" && sessionId && (
				<main className="flex-1 flex flex-col min-h-0 overflow-auto">
					<SessionView sessionId={sessionId} />
				</main>
			)}
		</div>
	);
}
