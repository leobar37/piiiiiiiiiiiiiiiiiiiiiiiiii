/**
 * Dashboard procedures — minimal server state info.
 *
 * The dashboard backend no longer manages sessions; it only serves the static
 * SPA and exposes basic health/metrics endpoints.
 */

import { os } from "@orpc/server";
import { z } from "zod";
import { logger } from "../logging.js";

// ============================================================================
// Procedures
// ============================================================================

export function createDashboardProcedures(getStartTime: () => number) {
	return {
		state: {
			get: os
				.output(
					z.object({
						uptime: z.number(),
					}),
				)
				.handler(async () => ({
					uptime: Date.now() - getStartTime(),
				})),
		},
		logs: {
			get: os
				.input(
					z.object({
						level: z.enum(["debug", "info", "warn", "error"]).optional(),
						limit: z.number().min(1).max(1000).optional(),
						sessionId: z.string().optional(),
					}),
				)
				.output(
					z.object({
						logs: z.array(
							z.object({
								timestamp: z.string(),
								level: z.enum(["debug", "info", "warn", "error"]),
								message: z.string(),
								context: z.record(z.unknown()).optional(),
							}),
						),
						total: z.number(),
					}),
				)
				.handler(async ({ input }) => {
					const logs = logger.getLogs(input);
					return { logs, total: logger.size };
				}),
		},
	};
}
