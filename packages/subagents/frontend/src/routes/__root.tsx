import { useEffect, type ReactNode } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../lib/query-client.ts";
import { installDashboardDebugGlobal } from "../dev/debug-ledger.ts";
import "../index.css";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "SubAgent Dashboard" },
		],
	}),
	component: RootComponent,
});

function RootComponent() {
	useEffect(() => {
		if (typeof window !== "undefined") {
			installDashboardDebugGlobal();
		}
	}, []);

	return (
		<RootDocument>
			<QueryClientProvider client={queryClient}>
				<Outlet />
			</QueryClientProvider>
		</RootDocument>
	);
}

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
