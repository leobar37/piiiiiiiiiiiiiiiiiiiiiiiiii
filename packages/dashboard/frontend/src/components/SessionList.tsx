import { useEffect, useState } from "react";

interface SessionInfo {
	id: string;
	name?: string;
	path: string;
	cwd: string;
	created: string;
	modified: string;
	messageCount: number;
}

export function SessionList() {
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadSessions() {
			try {
				const response = await fetch("/api/sessions");
				if (!response.ok) throw new Error("Failed to load sessions");
				const data = await response.json();
				setSessions(data.sessions || []);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		}

		loadSessions();
		// Refresh every 5 seconds
		const interval = setInterval(loadSessions, 5000);
		return () => clearInterval(interval);
	}, []);

	if (loading) {
		return (
			<div className="p-4 text-gray-500">
				<div className="animate-pulse">Loading sessions...</div>
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

	return (
		<div className="p-4">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-lg font-semibold text-gray-100">Sessions</h2>
				<span className="text-sm text-gray-500">{sessions.length} total</span>
			</div>

			{sessions.length === 0 ? (
				<div className="text-gray-500 text-sm">No sessions found.</div>
			) : (
				<div className="space-y-2">
					{sessions.map((session) => (
						<div
							key={session.id}
							className="rounded-lg border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition-colors cursor-pointer"
							onClick={() => (window.location.href = `/session/${session.id}`)}
						>
							<div className="flex items-center justify-between">
								<div className="font-mono text-sm text-gray-100">
									{session.name || session.id.slice(0, 8)}
								</div>
								<span className="text-xs text-gray-500">
									{session.messageCount} messages
								</span>
							</div>
							<div className="mt-1 text-xs text-gray-500 truncate">{session.cwd}</div>
							<div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
								<span>Modified: {new Date(session.modified).toLocaleString()}</span>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
