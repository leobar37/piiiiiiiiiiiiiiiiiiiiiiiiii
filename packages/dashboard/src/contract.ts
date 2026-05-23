/**
 * Contract types shared between server and frontend.
 *
 * This module re-exports only type-level constructs so that the frontend
 * can import them without pulling in server-side runtime dependencies.
 */

export type { DashboardEventPayload, DashboardRouter, DashboardState, LionDashboardState } from "./router.js";
