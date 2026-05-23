export type { DashboardEventPayload, DashboardRouter, DashboardState, LionDashboardState } from "./contract.js";
export { DashboardDaemon } from "./daemon.js";
export type { LiveSessionInfo, SessionHostConfig, SessionStatus } from "./session-host.js";

// Session host — runtime manager for live agent sessions
export { LiveSession, SessionHost } from "./session-host.js";
export type { SessionRouter } from "./session-router.js";

// Session router — oRPC endpoints for session CRUD + interaction
export { createSessionRouter } from "./session-router.js";
// Legacy session server (REST, stateless) — prefer SessionHost + SessionRouter
export type { SessionServer, SessionServerConfig } from "./session-server.js";
export { createSessionServer } from "./session-server.js";
export type { DashboardConfig } from "./types.js";
