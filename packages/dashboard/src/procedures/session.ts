/**
 * Session procedures — CRUD, lifecycle, interaction, state.
 *
 * All endpoints use Zod schemas and the typed oRPC client.
 * Event streaming is now handled by the unified `events.stream` endpoint.
 */

import { os } from "@orpc/server";
import { z } from "zod";
import type { EventStreamProvider } from "../events/provider.js";
import { logger } from "../logging.js";
import type { ProjectService } from "../projects/service.js";
import type { SessionHost } from "../session/host.js";
import { ModelInfoSchema, SessionInfoSchema, SessionStateSchema } from "./schemas.js";

// ============================================================================
// Session procedures
// ============================================================================

export function createSessionProcedures(
	sessionHost: SessionHost,
	_eventProvider: EventStreamProvider,
	projectService?: ProjectService,
) {
	return {
		// ---------------------------------------------------------------------
		// CRUD
		// ---------------------------------------------------------------------

		list: os
			.input(
				z
					.object({
						cwd: z.string().optional(),
						projectId: z.string().optional(),
						scope: z.enum(["global", "project"]).optional(),
					})
					.optional(),
			)
			.output(z.object({ sessions: z.array(SessionInfoSchema) }))
			.handler(async ({ input }) => {
				try {
					if (projectService) {
						const scope = input?.scope ?? (input?.projectId ? "project" : "global");
						const projectId = input?.projectId;
						if (scope === "project" && !input?.projectId) {
							throw new Error("projectId is required for project-scoped session lists");
						}
						if (scope === "global" && input?.projectId) {
							throw new Error("projectId cannot be used with global session lists");
						}
						const sessions = await projectService.listSessions(scope === "project" ? projectId : undefined);
						return { sessions };
					}
					const sessions = await sessionHost.list(input?.cwd);
					return { sessions };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`List failed: ${message}`);
				}
			}),

		create: os
			.input(z.object({ projectId: z.string(), cwd: z.string().optional() }))
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				try {
					if (projectService) {
						const session = await projectService.createSession(input.projectId, input.cwd);
						return { session };
					}
					const session = await sessionHost.create(input.cwd);
					return { session: session.info };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`Create failed: ${message}`);
				}
			}),

		get: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				const session = await sessionHost.resolve(input.sessionId);
				if (!session) throw new Error(`Session ${input.sessionId} not found`);
				return { session: session.info };
			}),

		remove: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				try {
					const success = await sessionHost.remove(input.sessionId);
					if (success) {
						await projectService?.removeSession(input.sessionId);
					}
					return { success };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`Remove failed: ${message}`);
				}
			}),

		open: os
			.input(z.object({ sessionFile: z.string(), cwdOverride: z.string().optional() }))
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				try {
					const session = await sessionHost.open(input.sessionFile, input.cwdOverride);
					return { session: session.info };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`Open failed: ${message}`);
				}
			}),

		continueRecent: os
			.input(z.object({ cwd: z.string().optional() }))
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				try {
					const session = await sessionHost.continueRecent(input.cwd);
					return { session: session.info };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`ContinueRecent failed: ${message}`);
				}
			}),

		// ---------------------------------------------------------------------
		// Runtime lifecycle
		// ---------------------------------------------------------------------

		move: os
			.input(z.object({ sessionId: z.string(), projectId: z.string() }))
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				if (!projectService) throw new Error("Project service is not available");
				const session = await projectService.moveSession(input.sessionId, input.projectId);
				return { session };
			}),

		start: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				try {
					await sessionHost.start(input.sessionId);
					return { success: true };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`Start failed: ${message}`);
				}
			}),

		stop: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				try {
					await sessionHost.stop(input.sessionId);
					return { success: true };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`Stop failed: ${message}`);
				}
			}),

		startLion: os
			.input(
				z.object({
					plan: z.unknown(),
					cwd: z.string().optional(),
					env: z.record(z.string()).optional(),
				}),
			)
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				try {
					const { session } = await sessionHost.createLionSession(input.plan, {
						cwd: input.cwd,
						env: input.env,
					});
					return { session: session.info };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`StartLion failed: ${message}`);
				}
			}),

		// ---------------------------------------------------------------------
		// Interaction
		// ---------------------------------------------------------------------

		prompt: os
			.input(
				z.object({
					sessionId: z.string(),
					message: z.string(),
					streamingBehavior: z.enum(["steer", "followUp"]).optional(),
				}),
			)
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				try {
					logger.info("Prompt endpoint called", { sessionId: input.sessionId });
					await sessionHost.prompt(input.sessionId, input.message, {
						streamingBehavior: input.streamingBehavior,
					});
					logger.info("Prompt endpoint succeeded", { sessionId: input.sessionId });
					return { success: true };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					logger.error("Prompt endpoint failed", { sessionId: input.sessionId, error: message });
					throw new Error(`Prompt failed: ${message}`);
				}
			}),

		steer: os
			.input(z.object({ sessionId: z.string(), message: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				try {
					await sessionHost.steer(input.sessionId, input.message);
					return { success: true };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`Steer failed: ${message}`);
				}
			}),

		followUp: os
			.input(z.object({ sessionId: z.string(), message: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				try {
					await sessionHost.followUp(input.sessionId, input.message);
					return { success: true };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`FollowUp failed: ${message}`);
				}
			}),

		abort: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				try {
					await sessionHost.abort(input.sessionId);
					return { success: true };
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					throw new Error(`Abort failed: ${message}`);
				}
			}),

		// ---------------------------------------------------------------------
		// State
		// ---------------------------------------------------------------------

		state: {
			get: os
				.input(z.object({ sessionId: z.string() }))
				.output(SessionStateSchema)
				.handler(async ({ input }) => {
					const session = await sessionHost.resolve(input.sessionId);
					if (!session) throw new Error(`Session ${input.sessionId} not found`);
					return session.getState();
				}),
		},

		messages: {
			get: os
				.input(z.object({ sessionId: z.string() }))
				.output(z.object({ messages: z.array(z.any()) }))
				.handler(async ({ input }) => {
					const session = await sessionHost.resolve(input.sessionId);
					if (!session) throw new Error(`Session ${input.sessionId} not found`);
					return { messages: session.getMessages() };
				}),
		},

		// ---------------------------------------------------------------------
		// Models
		// ---------------------------------------------------------------------

		models: {
			list: os
				.input(z.object({ sessionId: z.string().optional() }))
				.output(
					z.object({
						models: z.array(ModelInfoSchema),
						current: ModelInfoSchema.optional(),
					}),
				)
				.handler(async ({ input }) => {
					const models = sessionHost.getAvailableModels();
					const current = input.sessionId ? sessionHost.getSessionModel(input.sessionId) : undefined;
					return {
						models,
						current: current
							? models.find((m) => m.provider === current.provider && m.id === current.id)
							: undefined,
					};
				}),

			set: os
				.input(
					z.object({
						sessionId: z.string(),
						provider: z.string(),
						modelId: z.string(),
					}),
				)
				.output(z.object({ success: z.boolean() }))
				.handler(async ({ input }) => {
					await sessionHost.setSessionModel(input.sessionId, input.provider, input.modelId);
					return { success: true };
				}),
		},
	};
}

export type SessionProcedures = ReturnType<typeof createSessionProcedures>;
