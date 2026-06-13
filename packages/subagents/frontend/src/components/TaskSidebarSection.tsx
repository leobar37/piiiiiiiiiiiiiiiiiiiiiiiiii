import { Ban, Check, Circle, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
	groupTasks,
	useBlockTask,
	useCompleteTask,
	useCreateTask,
	useDeleteTask,
	useTasks,
	useUpdateTask,
} from "../hooks/use-tasks.ts";
import type { TaskRecord } from "../types.ts";

interface TaskSidebarSectionProps {
	sessionId?: string;
	tasksOverride?: TaskRecord[];
}

export function TaskSidebarSection({ sessionId, tasksOverride }: TaskSidebarSectionProps) {
	const { data, isLoading } = useTasks({ enabled: tasksOverride === undefined, refetchInterval: 15000 });
	const createTask = useCreateTask();
	const updateTask = useUpdateTask();
	const completeTask = useCompleteTask();
	const blockTask = useBlockTask();
	const deleteTask = useDeleteTask();
	const [title, setTitle] = useState("");
	const [notes, setNotes] = useState("");
	const tasks = tasksOverride ?? data ?? [];
	const grouped = useMemo(() => groupTasks(tasks), [tasks]);
	const isMutating =
		createTask.isPending || updateTask.isPending || completeTask.isPending || blockTask.isPending || deleteTask.isPending;

	const submitTask = () => {
		const trimmedTitle = title.trim();
		const trimmedNotes = notes.trim();
		if (!trimmedTitle) return;
		createTask.mutate(
			{
				title: trimmedTitle,
				actorSessionId: sessionId,
				context: trimmedNotes ? { notes: trimmedNotes } : undefined,
			},
			{
				onSuccess: () => {
					setTitle("");
					setNotes("");
				},
			},
		);
	};

	return (
		<section className="rounded border border-border-subtle bg-bg px-3 py-3">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Tasks</h2>
				<div className="text-[11px] text-text-muted">{tasks.length}</div>
			</div>

			<div className="space-y-2">
				<input
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							submitTask();
						}
					}}
					placeholder="Task"
					className="w-full rounded border border-border-subtle bg-bg-elevated px-2 py-1.5 text-xs text-text-primary outline-none transition placeholder:text-text-muted focus:border-border-hover"
				/>
				<textarea
					value={notes}
					onChange={(event) => setNotes(event.target.value)}
					placeholder="Context"
					rows={2}
					className="max-h-24 min-h-12 w-full resize-y rounded border border-border-subtle bg-bg-elevated px-2 py-1.5 text-xs text-text-primary outline-none transition placeholder:text-text-muted focus:border-border-hover"
				/>
				<button
					type="button"
					onClick={submitTask}
					disabled={!title.trim() || isMutating}
					title="Create task"
					className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded border border-border-subtle bg-bg-surface px-2 text-xs font-medium text-text-primary transition hover:border-border-hover disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Plus className="h-3.5 w-3.5" />
					Add
				</button>
			</div>

			<div className="mt-4 space-y-3">
				{isLoading && tasks.length === 0 ? <div className="text-xs text-text-muted">Loading tasks...</div> : null}
				<TaskGroup
					title="Active"
					tasks={grouped.active}
					empty="No active task"
					actions={(task) => (
						<>
							<TaskIconButton
								title="Complete"
								disabled={isMutating}
								onClick={() => completeTask.mutate({ id: task.id, actorSessionId: sessionId, expectedRevision: task.revision })}
							>
								<Check className="h-3.5 w-3.5" />
							</TaskIconButton>
							<TaskIconButton
								title="Block"
								disabled={isMutating}
								onClick={() => blockTaskFromPrompt(blockTask.mutate, task, sessionId)}
							>
								<Ban className="h-3.5 w-3.5" />
							</TaskIconButton>
						</>
					)}
				/>
				<TaskGroup
					title="Pending"
					tasks={grouped.pending}
					empty="No pending task"
					actions={(task) => (
						<>
							<TaskIconButton
								title="Start"
								disabled={isMutating || !sessionId}
								onClick={() =>
									updateTask.mutate({
										id: task.id,
										status: "in_progress",
										assignedToSession: sessionId,
										actorSessionId: sessionId,
										expectedRevision: task.revision,
									})
								}
							>
								<Play className="h-3.5 w-3.5" />
							</TaskIconButton>
							<TaskIconButton
								title="Complete"
								disabled={isMutating}
								onClick={() => completeTask.mutate({ id: task.id, actorSessionId: sessionId, expectedRevision: task.revision })}
							>
								<Check className="h-3.5 w-3.5" />
							</TaskIconButton>
						</>
					)}
				/>
				<TaskGroup
					title="Blocked"
					tasks={grouped.blocked}
					empty="No blocked task"
					actions={(task) => (
						<TaskIconButton
							title="Reopen"
							disabled={isMutating}
							onClick={() =>
								updateTask.mutate({
									id: task.id,
									status: "pending",
									assignedToSession: null,
									actorSessionId: sessionId,
									expectedRevision: task.revision,
								})
							}
						>
							<RotateCcw className="h-3.5 w-3.5" />
						</TaskIconButton>
					)}
				/>
				<TaskGroup
					title="Done"
					tasks={grouped.completed.slice(0, 4)}
					empty="No completed task"
					actions={(task) => (
						<TaskIconButton
							title="Delete"
							disabled={isMutating}
							onClick={() => deleteTask.mutate({ id: task.id, actorSessionId: sessionId, expectedRevision: task.revision })}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</TaskIconButton>
					)}
				/>
			</div>
		</section>
	);
}

interface TaskGroupProps {
	title: string;
	tasks: TaskRecord[];
	empty: string;
	actions(task: TaskRecord): ReactNode;
}

function TaskGroup({ title, tasks, empty, actions }: TaskGroupProps) {
	return (
		<div>
			<div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-text-tertiary">
				<span>{title}</span>
				<span>{tasks.length}</span>
			</div>
			{tasks.length === 0 ? (
				<div className="rounded border border-border-subtle bg-bg-elevated px-2 py-1.5 text-xs text-text-muted">{empty}</div>
			) : (
				<div className="space-y-1.5">
					{tasks.map((task) => (
						<div key={task.id} className="rounded border border-border-subtle bg-bg-elevated px-2 py-2">
							<div className="flex items-start gap-2">
								<Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
								<div className="min-w-0 flex-1">
									<div className="truncate text-xs font-medium text-text-primary" title={task.title}>
										{task.title}
									</div>
									{task.context?.notes ? (
										<div className="mt-1 line-clamp-2 text-[11px] leading-snug text-text-muted">{task.context.notes}</div>
									) : null}
								</div>
								<div className="flex shrink-0 items-center gap-1">{actions(task)}</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function TaskIconButton({
	title,
	disabled,
	onClick,
	children,
}: {
	title: string;
	disabled?: boolean;
	onClick(): void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			disabled={disabled}
			onClick={onClick}
			className="inline-flex h-6 w-6 items-center justify-center rounded border border-border-subtle text-text-secondary transition hover:border-border-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
		>
			{children}
		</button>
	);
}

function blockTaskFromPrompt(
	mutate: (input: { id: string; reason: string; actorSessionId?: string; expectedRevision?: number }) => void,
	task: TaskRecord,
	actorSessionId?: string,
): void {
	const reason = window.prompt("Block reason");
	if (!reason?.trim()) return;
	mutate({ id: task.id, reason: reason.trim(), actorSessionId, expectedRevision: task.revision });
}
