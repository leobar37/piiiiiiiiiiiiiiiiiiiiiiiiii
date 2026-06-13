/**
 * Contract types shared between server and frontend.
 *
 * This module re-exports only type-level constructs so that the frontend
 * can import them without pulling in server-side runtime dependencies.
 */

// Event types -- for the frontend event consumer
export type { ServerEvent, ServerEventType } from "./events/types.js";
export type { ProjectInfo, ProjectSessionInfo } from "./projects/types.js";
// Session types -- for typed oRPC clients
export type {
	LiveSessionInfo,
	LiveSessionInfo as SessionInfo,
	SessionHostConfig,
	SessionStatus,
} from "./session/types.js";
