import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, orpc } from "../api/client.ts";
import { invalidateTaskQueries } from "../lib/task-query-cache.ts";
import type { TaskContext, TaskRecord, TaskStatus } from "../types.ts";

interface TaskListOptions {
	includeDeleted?: boolean;
	enabled?: boolean;
	refetchInterval?: number | false;
}

interface CreateDashboardTaskInput {
	title: string;
	status?: TaskStatus;
	assignedToSession?: string;
	actorSessionId?: string;
	context?: TaskContext;
}

interface UpdateDashboardTaskInput {
	id: string;
	title?: string;
	status?: TaskStatus;
	assignedToSession?: string | null;
	actorSessionId?: string;
	context?: TaskContext;
	expectedRevision?: number;
}

export function useTasks(options: TaskListOptions = {}) {
	const { includeDeleted = false, enabled = true, refetchInterval } = options;
	return useQuery({
		...api.tasks.list.queryOptions({ input: { includeDeleted } }),
		enabled,
		refetchInterval,
	});
}

export function useCreateTask() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: CreateDashboardTaskInput) => orpc.tasks.create(input),
		onSettled: () => invalidateTasks(queryClient),
	});
}

export function useUpdateTask() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: UpdateDashboardTaskInput) => orpc.tasks.update(input),
		onSettled: () => invalidateTasks(queryClient),
	});
}

export function useCompleteTask() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: Pick<UpdateDashboardTaskInput, "id" | "actorSessionId" | "expectedRevision">) =>
			orpc.tasks.complete(input),
		onSettled: () => invalidateTasks(queryClient),
	});
}

export function useBlockTask() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; reason: string; actorSessionId?: string; expectedRevision?: number }) =>
			orpc.tasks.block(input),
		onSettled: () => invalidateTasks(queryClient),
	});
}

export function useDeleteTask() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: Pick<UpdateDashboardTaskInput, "id" | "actorSessionId" | "expectedRevision">) =>
			orpc.tasks.delete(input),
		onSettled: () => invalidateTasks(queryClient),
	});
}

function invalidateTasks(queryClient: QueryClient): void {
	invalidateTaskQueries(queryClient);
}

export function groupTasks(tasks: TaskRecord[]): {
	active: TaskRecord[];
	pending: TaskRecord[];
	blocked: TaskRecord[];
	completed: TaskRecord[];
} {
	return {
		active: tasks.filter((task) => task.status === "in_progress"),
		pending: tasks.filter((task) => task.status === "pending"),
		blocked: tasks.filter((task) => task.status === "blocked"),
		completed: tasks.filter((task) => task.status === "completed"),
	};
}
