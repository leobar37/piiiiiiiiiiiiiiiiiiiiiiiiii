/**
 * Dashboard router factory.
 *
 * Creates the top-level oRPC router with dashboard and session procedures.
 */

import type { EventStreamProvider } from "../events/provider.js";
import type { ProjectService } from "../projects/service.js";
import type { SessionHost } from "../session/host.js";
import { createDashboardProcedures } from "./dashboard.js";
import { createProjectProcedures } from "./project.js";
import { createSessionProcedures } from "./session.js";

// ============================================================================
// Router factory
// ============================================================================

export function createDashboardRouter(
	eventProvider: EventStreamProvider,
	getStartTime: () => number,
	sessionHost?: SessionHost,
	projectService?: ProjectService,
) {
	const baseRouter = createDashboardProcedures(eventProvider, getStartTime, sessionHost);

	if (!sessionHost) {
		return baseRouter;
	}

	const sessions = createSessionProcedures(sessionHost, eventProvider, projectService);

	return {
		...baseRouter,
		...(projectService ? { projects: createProjectProcedures(projectService) } : {}),
		sessions,
	};
}

export type DashboardRouter = ReturnType<typeof createDashboardRouter>;
export type { ProjectProcedures } from "./project.js";
export type { SessionProcedures } from "./session.js";
