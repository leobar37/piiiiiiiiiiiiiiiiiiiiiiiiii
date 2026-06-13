/**
 * Dashboard router factory.
 *
 * Creates a minimal oRPC router for the static-file-serving backend. Session
 * management has moved to the subagents backend.
 */

import { createDashboardProcedures } from "./dashboard.js";

// ============================================================================
// Router factory
// ============================================================================

export function createDashboardRouter(getStartTime: () => number) {
	return createDashboardProcedures(getStartTime);
}

export type DashboardRouter = ReturnType<typeof createDashboardRouter>;
