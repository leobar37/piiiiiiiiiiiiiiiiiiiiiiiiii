import { eventIterator, os } from "@orpc/server";
import { z } from "zod";
import type { DashboardEventBridge } from "./bridge.js";
import type { SessionHost } from "./session-host.js";
import { createSessionRouter } from "./session-router.js";

// ============================================================
// Schemas
// ============================================================

const DashboardEventPayloadSchema = z.object({
	id: z.string(),
	type: z.string(),
	source: z.enum(["lion", "subagent"]),
	payload: z.unknown(),
	timestamp: z.number(),
	runId: z.string().optional(),
	planSlug: z.string().optional(),
	planPath: z.string().optional(),
	taskId: z.string().optional(),
	attempt: z.number().optional(),
});

const LionDashboardStateSchema = z
	.object({
		active: z.boolean(),
		mode: z.enum(["planning", "building"]).nullable(),
		activePlan: z
			.object({
				slug: z.string().nullable(),
				path: z.string().nullable(),
				kind: z.string().nullable(),
			})
			.nullable(),
		activeTask: z
			.object({
				id: z.string().nullable(),
				title: z.string().nullable(),
				status: z.string(),
			})
			.nullable(),
		activeRun: z
			.object({
				runId: z.string().nullable(),
				status: z.string(),
				attempt: z.number(),
			})
			.nullable(),
		subagents: z.array(
			z.object({
				taskId: z.string(),
				role: z.string(),
				status: z.string(),
				turnCount: z.number(),
				currentTool: z.string().nullable(),
				summary: z.string().nullable(),
				startedAt: z.number(),
				updatedAt: z.number(),
			}),
		),
		runHistory: z.array(
			z.object({
				runId: z.string(),
				planSlug: z.string(),
				taskTitle: z.string(),
				status: z.string(),
				attempts: z.number(),
				createdAt: z.number(),
			}),
		),
	})
	.nullable();

const DashboardStateSchema = z.object({
	uptime: z.number(),
	bridgeCount: z.number(),
	subscriberCount: z.number(),
	recentEvents: z.array(DashboardEventPayloadSchema),
	lion: LionDashboardStateSchema,
});

// ============================================================
// Types
// ============================================================

export interface DashboardEventPayload {
	id: string;
	type: string;
	source: "lion" | "subagent";
	payload: unknown;
	timestamp: number;
	runId?: string;
	planSlug?: string;
	planPath?: string;
	taskId?: string;
	attempt?: number;
}

export interface LionDashboardState {
	active: boolean;
	mode: "planning" | "building" | null;
	activePlan: { slug: string | null; path: string | null; kind: string | null } | null;
	activeTask: { id: string | null; title: string | null; status: string } | null;
	activeRun: { runId: string | null; status: string; attempt: number } | null;
	subagents: Array<{
		taskId: string;
		role: string;
		status: string;
		turnCount: number;
		currentTool: string | null;
		summary: string | null;
		startedAt: number;
		updatedAt: number;
	}>;
	runHistory: Array<{
		runId: string;
		planSlug: string;
		taskTitle: string;
		status: string;
		attempts: number;
		createdAt: number;
	}>;
}

export interface DashboardState {
	uptime: number;
	bridgeCount: number;
	subscriberCount: number;
	recentEvents: DashboardEventPayload[];
	lion: LionDashboardState | null;
}

// ============================================================
// Router factory
// ============================================================

export async function getDashboardState(
	bridge: DashboardEventBridge,
	getStartTime: () => number,
	getLionState?: () => LionDashboardState | null,
): Promise<DashboardState> {
	return {
		uptime: Date.now() - getStartTime(),
		bridgeCount: bridge.bridgeCount,
		subscriberCount: bridge.getSubscriberCount(),
		recentEvents: bridge.getRecentEvents(),
		lion: getLionState?.() ?? null,
	};
}

export async function* streamDashboardEvents(
	bridge: DashboardEventBridge,
	signal: AbortSignal | undefined,
	pingIntervalMs = 5000,
): AsyncGenerator<DashboardEventPayload> {
	bridge.incrementSubscribers();
	const subscriber = bridge.getPublisher().subscribe("*", { signal });
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
						id: `ping-${Date.now()}`,
						type: "ping",
						source: "lion",
						payload: null,
						timestamp: Date.now(),
					};
				} else {
					yield result.value;
					nextEvent = subscriber.next();
				}
			} catch (err) {
				// subscriber.next() may throw on abort; log unexpected errors
				if (!signal?.aborted) {
					console.error("[dashboard] stream error:", err);
				}
				break;
			}
		}
	} finally {
		bridge.decrementSubscribers();
	}
}

export function createDashboardRouter(
	bridge: DashboardEventBridge,
	getStartTime: () => number,
	getLionState?: () => LionDashboardState | null,
	sessionHost?: SessionHost,
	pingIntervalMs = 5000,
) {
	const baseRouter = {
		state: {
			get: os
				.output(DashboardStateSchema)
				.handler(async () => getDashboardState(bridge, getStartTime, getLionState)),
		},
		events: {
			stream: os.output(eventIterator(DashboardEventPayloadSchema)).handler(async function* ({ signal }) {
				yield* streamDashboardEvents(bridge, signal, pingIntervalMs);
			}),
		},
	};

	if (!sessionHost) {
		return baseRouter;
	}

	const sessionRouter = createSessionRouter(sessionHost, pingIntervalMs);

	return {
		...baseRouter,
		sessions: sessionRouter,
	};
}

export type DashboardRouter = ReturnType<typeof createDashboardRouter>;
