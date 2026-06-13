// Dashboard daemon

export { createDashboardDb, getDashboardDbPath } from "./db/client.js";
export { EventStreamProvider } from "./events/provider.js";
export { serializeAgentSessionEvent } from "./events/serialize.js";
// Event types
export type { ServerEvent, ServerEventType } from "./events/types.js";
export { ProjectService } from "./projects/service.js";
export type { ProjectInfo, ProjectSessionInfo } from "./projects/types.js";
export { DashboardDaemon } from "./server/daemon.js";
// Session host -- runtime manager for live agent sessions
export { LiveSession, SessionHost } from "./session/index.js";
export type { LiveSessionInfo, SessionHostConfig, SessionStatus } from "./session/types.js";
// Shared types
export type { DashboardConfig } from "./types.js";
