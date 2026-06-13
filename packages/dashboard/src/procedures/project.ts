import { os } from "@orpc/server";
import { z } from "zod";
import type { ProjectService } from "../projects/service.js";
import { ProjectInfoSchema } from "./schemas.js";

export function createProjectProcedures(projectService: ProjectService) {
	return {
		list: os
			.input(z.object({}).optional())
			.output(z.object({ projects: z.array(ProjectInfoSchema) }))
			.handler(async () => {
				const projects = await projectService.listProjects();
				return { projects };
			}),

		create: os
			.input(
				z.object({
					name: z.string().optional(),
					defaultCwd: z.string().optional(),
				}),
			)
			.output(z.object({ project: ProjectInfoSchema }))
			.handler(async ({ input }) => {
				const project = await projectService.createProject(input);
				return { project };
			}),

		update: os
			.input(
				z.object({
					projectId: z.string(),
					name: z.string().optional(),
					defaultCwd: z.string().nullable().optional(),
				}),
			)
			.output(z.object({ project: ProjectInfoSchema }))
			.handler(async ({ input }) => {
				const project = await projectService.updateProject(input.projectId, {
					name: input.name,
					defaultCwd: input.defaultCwd,
				});
				return { project };
			}),

		archive: os
			.input(z.object({ projectId: z.string() }))
			.output(z.object({ success: z.boolean() }))
			.handler(async ({ input }) => {
				const success = await projectService.archiveProject(input.projectId);
				return { success };
			}),
	};
}

export type ProjectProcedures = ReturnType<typeof createProjectProcedures>;
