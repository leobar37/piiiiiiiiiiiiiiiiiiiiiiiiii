import { useEffect, useState } from "react";
import { orpc } from "../orpc.js";
import { useDashboardStore } from "../store/dashboard.js";

export function ConnectionStatus() {
	const { connected, uptime, bridgeCount, setServerInfo, setLionState } = useDashboardStore();
	const [subscriberCount, setSubscriberCount] = useState(0);

	useEffect(() => {
		const interval = setInterval(async () => {
			try {
				const state = await orpc.dashboard.state.get();
				setServerInfo(state.uptime, state.bridgeCount);
				setLionState(state.lion);
				setSubscriberCount(state.subscriberCount);
			} catch {
				// Server might be down
			}
		}, 2000);
		return () => clearInterval(interval);
	}, [setServerInfo, setLionState]);

	const uptimeSeconds = Math.floor(uptime / 1000);
	const uptimeText =
		uptimeSeconds < 60 ? `${uptimeSeconds}s` : `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`;

	return (
		<div className="flex items-center gap-4 px-4 py-2 bg-gray-900 border-b border-gray-800 text-sm">
			<div className="flex items-center gap-2">
				<div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
				<span className={connected ? "text-green-400" : "text-red-400"}>
					{connected ? "Connected" : "Disconnected"}
				</span>
			</div>
			<div className="text-gray-400">
				Uptime: <span className="text-gray-200">{uptimeText}</span>
			</div>
			<div className="text-gray-400">
				Bridges: <span className="text-gray-200">{bridgeCount}</span>
			</div>
			<div className="text-gray-400">
				Subscribers: <span className="text-gray-200">{subscriberCount}</span>
			</div>
		</div>
	);
}
