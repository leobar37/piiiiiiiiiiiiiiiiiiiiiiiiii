/**
 * Contract types shared between server and frontend.
 *
 * This module re-exports only type-level constructs so that the frontend
 * can import them without pulling in server-side runtime dependencies.
 *
 * NOTE: The dashboard no longer exposes session or event APIs. Sessions are
 * managed by the subagents backend rendered inside iframes.
 */

export type { DashboardRouter } from "./procedures/index.js";
export type { DashboardConfig } from "./types.js";
