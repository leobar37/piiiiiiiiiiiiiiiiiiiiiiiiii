import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { eventIterator, os } from "@orpc/server";
import { z } from "zod";
import type { LiveSessionInfo, SessionHost, SessionStatus } from "./session-host.js";

// ============================================================================
// Schemas
// ============================================================================

const SessionStatusSchema = z.enum([
	"created",
	"starting",
	"idle",
	"streaming",
	"error",
	"stopped",
]) satisfies z.ZodType<SessionStatus>;

const SessionInfoSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	status: SessionStatusSchema,
	sessionFile: z.string().optional(),
	cwd: z.string(),
	createdAt: z.number(),
	lastActivityAt: z.number(),
	messageCount: z.number(),
}) satisfies z.ZodType<LiveSessionInfo>;

const SessionStateSchema = z.object({
	status: SessionStatusSchema,
	isStreaming: z.boolean(),
	isCompacting: z.boolean(),
	pendingMessageCount: z.number(),
	messageCount: z.number(),
});

const SessionEventSchema = z
	.object({
		type: z.string(),
	})
	.passthrough() as z.ZodType<AgentSessionEvent>;

// ============================================================================
// Router factory
// ============================================================================

export function createSessionRouter(sessionHost: SessionHost, pingIntervalMs = 5000) {
	return {
		// ---------------------------------------------------------------------
		// CRUD
		// ---------------------------------------------------------------------

		/** List all sessions known to the host. */
		list: os
			.output(z.object({ sessions: z.array(SessionInfoSchema) }))
			.handler(async () => ({ sessions: sessionHost.list() })),

		/** Create a new session. */
		create: os
			.input(z.object({ cwd: z.string().optional() }))
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				const session = await sessionHost.create(input.cwd);
				return { session: session.info };
			}),

		/** Get a single session by id. */
		get: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				const session = sessionHost.get(input.sessionId);
				if (!session) throw new Error("Session not found");
				return { session: session.info };
			}),

		/** Remove a session from the host (stops runtime if running). */
		remove: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				const success = await sessionHost.remove(input.sessionId);
				return { success };
			}),

		/** Open an existing session file. */
		open: os
			.input(z.object({ sessionFile: z.string(), cwdOverride: z.string().optional() }))
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				const session = await sessionHost.open(input.sessionFile, input.cwdOverride);
				return { session: session.info };
			}),

		/** Continue the most recent session for a cwd. */
		continueRecent: os
			.input(z.object({ cwd: z.string().optional() }))
			.output(z.object({ session: SessionInfoSchema }))
			.handler(async ({ input }) => {
				const session = await sessionHost.continueRecent(input.cwd);
				return { session: session.info };
			}),

		// ---------------------------------------------------------------------
		// Runtime lifecycle
		// ---------------------------------------------------------------------

		/** Start (or resume) the agent runtime for a session. */
		start: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				await sessionHost.start(input.sessionId);
				return { success: true };
			}),

		/** Stop the agent runtime (persists conversation). */
		stop: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				await sessionHost.stop(input.sessionId);
				return { success: true };
			}),

		// ---------------------------------------------------------------------
		// Interaction
		// ---------------------------------------------------------------------

		/** Send a prompt to a running session. */
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
				await sessionHost.prompt(input.sessionId, input.message, {
					streamingBehavior: input.streamingBehavior,
				});
				return { success: true };
			}),

		/** Queue a steering message while the agent is streaming. */
		steer: os
			.input(z.object({ sessionId: z.string(), message: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				await sessionHost.steer(input.sessionId, input.message);
				return { success: true };
			}),

		/** Queue a follow-up message. */
		followUp: os
			.input(z.object({ sessionId: z.string(), message: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				await sessionHost.followUp(input.sessionId, input.message);
				return { success: true };
			}),

		/** Abort the current operation. */
		abort: os
			.input(z.object({ sessionId: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				await sessionHost.abort(input.sessionId);
				return { success: true };
			}),

		// ---------------------------------------------------------------------
		// State
		// ---------------------------------------------------------------------

		/** Get session runtime state. */
		state: {
			get: os
				.input(z.object({ sessionId: z.string() }))
				.output(SessionStateSchema)
				.handler(async ({ input }) => {
					const session = sessionHost.get(input.sessionId);
					if (!session) throw new Error("Session not found");
					return session.getState();
				}),
		},

		/** Get all messages (reconstructs from disk if runtime is not running). */
		messages: {
			get: os
				.input(z.object({ sessionId: z.string() }))
				.output(z.object({ messages: z.array(z.any()) }))
				.handler(async ({ input }) => {
					const session = sessionHost.get(input.sessionId);
					if (!session) throw new Error("Session not found");
					return { messages: session.getMessages() };
				}),
		},

		// ---------------------------------------------------------------------
		// Event streaming
		// ---------------------------------------------------------------------

		/** SSE stream of agent events for a specific session. */
		events: {
			stream: os
				.input(z.object({ sessionId: z.string() }))
				.output(eventIterator(SessionEventSchema))
				.handler(async function* ({ input, signal }) {
					const session = sessionHost.get(input.sessionId);
					if (!session) throw new Error("Session not found");

					const subscriber = session.eventPublisher.subscribe("*", { signal });
					let nextEvent = subscriber.next();

					try {
						while (!signal?.aborted) {
							const pingPromise = new Promise<{ ping: true }>((resolve) => {
								setTimeout(() => resolve({ ping: true }), pingIntervalMs);
							});

							try {
								const result = await Promise.race([nextEvent, pingPromise]);

								if ("ping" in result) {
									yield {
										type: "ping",
									} as unknown as AgentSessionEvent;
								} else {
									yield result.value;
									nextEvent = subscriber.next();
								}
							} catch (err) {
								if (!signal?.aborted) {
									console.error("[session-router] stream error:", err);
								}
								break;
							}
						}
					} finally {
						// subscriber cleaned up by AbortSignal
					}
				}),
		},
	};
}

export type SessionRouter = ReturnType<typeof createSessionRouter>;
