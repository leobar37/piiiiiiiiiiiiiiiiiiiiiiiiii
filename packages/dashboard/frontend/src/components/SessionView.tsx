import { useEffect, useState } from "react";

interface SessionEntry {
	id: string;
	type: string;
	timestamp: string;
	customType?: string;
	data?: Record<string, unknown>;
	message?: Record<string, unknown>;
}

interface SessionData {
	session: {
		id: string;
		name?: string;
		path: string;
		cwd: string;
		messageCount: number;
		entryCount: number;
	};
	entries: SessionEntry[];
}

export function SessionView({ sessionId }: { sessionId: string }) {
	const [sessionData, setSessionData] = useState<SessionData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [prompt, setPrompt] = useState("");

	useEffect(() => {
		async function loadSession() {
			try {
				const [sessionRes, entriesRes] = await Promise.all([
					fetch(`/api/sessions/${sessionId}`),
					fetch(`/api/sessions/${sessionId}/entries`),
				]);

				if (!sessionRes.ok) throw new Error("Failed to load session");
				if (!entriesRes.ok) throw new Error("Failed to load entries");

				const sessionData = await sessionRes.json();
				const entriesData = await entriesRes.json();

				setSessionData({
					session: sessionData.session,
					entries: entriesData.entries || [],
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		}

		loadSession();
	}, [sessionId]);

	async function sendPrompt() {
		if (!prompt.trim()) return;

		try {
			const response = await fetch(`/api/sessions/${sessionId}/prompt`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message: prompt }),
			});

			if (!response.ok) {
				const error = await response.json();
				alert(error.error || "Failed to send prompt");
				return;
			}

			setPrompt("");
			alert("Prompt sent! (Note: Actual execution requires pi CLI)");
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to send prompt");
		}
	}

	if (loading) {
		return (
			<div className="p-4 text-gray-500">
				<div className="animate-pulse">Loading session...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 text-red-400">
				Error: {error}
			</div>
		);
	}

	if (!sessionData) {
		return (
			<div className="p-4 text-gray-500">
				Session not found
			</div>
		);
	}

	return (
		<div className="p-4">
			<div className="mb-4">
				<button
					onClick={() => (window.location.href = "/")}
					className="text-sm text-gray-500 hover:text-gray-300"
				>
					← Back to sessions
				</button>
			</div>

			<div className="mb-6">
				<h2 className="text-lg font-semibold text-gray-100">
					{sessionData.session.name || sessionData.session.id.slice(0, 8)}
				</h2>
				<div className="text-sm text-gray-500">
					{sessionData.session.cwd}
				</div>
				<div className="text-xs text-gray-600 mt-1">
					{sessionData.session.messageCount} messages · {sessionData.session.entryCount} entries
				</div>
			</div>

			{/* Prompt input */}
			<div className="mb-6 rounded-lg border border-gray-800 bg-gray-900 p-3">
				<div className="text-xs text-gray-500 mb-2">Send Prompt</div>
				<div className="flex gap-2">
					<input
						type="text"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="Type your message..."
						className="flex-1 rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-gray-500 focus:outline-none"
						onKeyDown={(e) => e.key === "Enter" && sendPrompt()}
					/>
					<button
						onClick={sendPrompt}
						className="rounded bg-blue-900/40 px-4 py-2 text-sm text-blue-300 border border-blue-800 hover:bg-blue-900/60"
					>
						Send
					</button>
				</div>
			</div>

			{/* Entries */}
			<div className="space-y-2">
				<div className="text-xs text-gray-500 mb-2">Session Entries</div>
				{sessionData.entries.map((entry) => (
					<div
						key={entry.id}
						className="rounded border border-gray-800 bg-gray-900 p-2"
					>
						<div className="flex items-center gap-2 text-xs">
							<span className="font-mono text-gray-400">{entry.type}</span>
							{entry.customType && (
								<span className="text-gray-500">({entry.customType})</span>
							)}
							<span className="text-gray-600">
								{new Date(entry.timestamp).toLocaleString()}
							</span>
						</div>
						{entry.message && (
							<div className="mt-1 text-sm text-gray-300">
								{(() => {
									const msg = String(JSON.stringify(entry.message));
									return msg.slice(0, 200) + (msg.length > 200 ? "..." : "");
								})()}
							</div>
						)}
						{entry.data && (
							<div className="mt-1 text-xs text-gray-500">
								{(() => {
									const data = String(JSON.stringify(entry.data));
									return data.slice(0, 200) + (data.length > 200 ? "..." : "");
								})()}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
