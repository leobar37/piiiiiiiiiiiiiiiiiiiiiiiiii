import path from "node:path";
import { copyToClipboard, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import {
	appendExpandHint,
	formatTaskId,
	formatTaskList,
	renderTaskDetail,
	renderTaskList,
	serializeTaskForAgent,
	serializeTaskListForAgent,
} from "./format.js";
import { buildRefinePrompt } from "./prompts.js";
import { resolveTodosDir, resolveTodosDirLabel, TaskStore, toTaskStatus } from "./task-store.js";
import {
	type LegacyTodoAction,
	LegacyTodoParams,
	TaskBlockParams,
	TaskCreateParams,
	TaskIdParams,
	TaskListParams,
	type TaskRecord,
	type TaskStoreError,
	type TaskToolDetails,
	TaskUpdateParams,
} from "./types.js";
import {
	TaskActionMenuComponent,
	TaskDeleteConfirmComponent,
	TaskDetailOverlayComponent,
	TaskSelectorComponent,
} from "./ui.js";

export default function todosExtension(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		await getStore(ctx).initialize();
	});

	registerTaskTools(pi);
	registerLegacyTodoTool(pi);
	registerTodosCommand(pi);
}

function getStore(ctx: ExtensionContext): TaskStore {
	return new TaskStore(resolveTodosDir(ctx.cwd));
}

function currentSessionId(ctx: ExtensionContext): string {
	return ctx.sessionManager.getSessionId();
}

function taskResult(
	action: Exclude<TaskToolDetails["action"], "list">,
	task: TaskRecord,
): { content: Array<{ type: "text"; text: string }>; details: TaskToolDetails } {
	return {
		content: [{ type: "text", text: serializeTaskForAgent(task) }],
		details: { action, task },
	};
}

function errorResult(
	action: TaskToolDetails["action"],
	error: TaskStoreError,
): { content: Array<{ type: "text"; text: string }>; isError: true; details: TaskToolDetails } {
	return {
		content: [{ type: "text", text: error.message }],
		isError: true,
		details: { action, error },
	};
}

function missingTaskResult(
	action: TaskToolDetails["action"],
	message: string,
): { content: Array<{ type: "text"; text: string }>; isError: true; details: TaskToolDetails } {
	return errorResult(action, { code: "not_found", message });
}

function listResult(
	tasks: TaskRecord[],
	currentSessionId?: string,
): { content: Array<{ type: "text"; text: string }>; details: TaskToolDetails } {
	return {
		content: [{ type: "text", text: serializeTaskListForAgent(tasks) }],
		details: { action: "list", tasks, currentSessionId },
	};
}

function registerTaskTools(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "task_create",
		label: "Task Create",
		description:
			"Create a compact task for multi-step coding work. Use context only for operational hints: why, known files, doneWhen, notes.",
		promptSnippet: "Create compact tasks for non-trivial multi-step work",
		promptGuidelines: [
			"Use tasks for complex work, explicit user task lists, or work that benefits from visible progress.",
			"Keep task context compact; do not paste long investigations into a task.",
			"Keep at most one task in_progress for the current session.",
		],
		parameters: TaskCreateParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const store = getStore(ctx);
			await store.initialize();
			const result = await store.create(
				{
					title: params.title,
					status: params.status,
					context: params.context,
					assignedToSession: params.status === "in_progress" ? currentSessionId(ctx) : undefined,
				},
				currentSessionId(ctx),
			);
			if ("error" in result) return errorResult("create", result.error);
			return taskResult("create", result);
		},
		renderCall(args, theme) {
			return new Text(taskCallText(theme, "task_create", args.title), 0, 0);
		},
		renderResult: renderTaskToolResult,
	});

	pi.registerTool({
		name: "task_list",
		label: "Task List",
		description: "List current local session tasks. Deleted tasks are hidden unless includeDeleted is true.",
		promptSnippet: "Inspect task progress before choosing the next work item",
		parameters: TaskListParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const store = getStore(ctx);
			await store.initialize();
			const tasks = await store.list({ includeDeleted: params.includeDeleted });
			const sessionId = currentSessionId(ctx);
			return listResult(tasks, sessionId);
		},
		renderCall(_args, theme) {
			return new Text(taskCallText(theme, "task_list"), 0, 0);
		},
		renderResult: renderTaskToolResult,
	});

	pi.registerTool({
		name: "task_get",
		label: "Task Get",
		description: "Read one task by id.",
		parameters: TaskIdParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const store = getStore(ctx);
			await store.initialize();
			const task = await store.get(params.id);
			if (!task) return missingTaskResult("get", `Task ${formatTaskId(params.id)} not found.`);
			return taskResult("get", task);
		},
		renderCall(args, theme) {
			return new Text(taskCallText(theme, "task_get", formatTaskId(args.id)), 0, 0);
		},
		renderResult: renderTaskToolResult,
	});

	pi.registerTool({
		name: "task_update",
		label: "Task Update",
		description: "Patch a task title, status, context, or expected revision.",
		parameters: TaskUpdateParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const store = getStore(ctx);
			await store.initialize();
			const result = await store.update(
				{
					id: params.id,
					title: params.title,
					status: params.status,
					context: params.context,
					expectedRevision: params.expectedRevision,
					assignedToSession: params.status === "in_progress" ? currentSessionId(ctx) : undefined,
				},
				currentSessionId(ctx),
			);
			if ("error" in result) return errorResult("update", result.error);
			return taskResult("update", result);
		},
		renderCall(args, theme) {
			return new Text(taskCallText(theme, "task_update", formatTaskId(args.id)), 0, 0);
		},
		renderResult: renderTaskToolResult,
	});

	pi.registerTool({
		name: "task_complete",
		label: "Task Complete",
		description: "Mark a task completed after the work has concrete evidence.",
		parameters: TaskIdParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const store = getStore(ctx);
			await store.initialize();
			const result = await store.complete(params.id, undefined, currentSessionId(ctx));
			if ("error" in result) return errorResult("complete", result.error);
			return taskResult("complete", result);
		},
		renderCall(args, theme) {
			return new Text(taskCallText(theme, "task_complete", formatTaskId(args.id)), 0, 0);
		},
		renderResult: renderTaskToolResult,
	});

	pi.registerTool({
		name: "task_block",
		label: "Task Block",
		description: "Mark a task blocked with a concrete reason.",
		parameters: TaskBlockParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const store = getStore(ctx);
			await store.initialize();
			const result = await store.block(params.id, params.reason, params.expectedRevision, currentSessionId(ctx));
			if ("error" in result) return errorResult("block", result.error);
			return taskResult("block", result);
		},
		renderCall(args, theme) {
			return new Text(taskCallText(theme, "task_block", formatTaskId(args.id)), 0, 0);
		},
		renderResult: renderTaskToolResult,
	});

	pi.registerTool({
		name: "task_delete",
		label: "Task Delete",
		description: "Soft-delete a task. Deleted tasks remain in the event log.",
		parameters: TaskIdParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const store = getStore(ctx);
			await store.initialize();
			const result = await store.softDelete(params.id, undefined, currentSessionId(ctx));
			if ("error" in result) return errorResult("delete", result.error);
			return taskResult("delete", result);
		},
		renderCall(args, theme) {
			return new Text(taskCallText(theme, "task_delete", formatTaskId(args.id)), 0, 0);
		},
		renderResult: renderTaskToolResult,
	});
}

function registerLegacyTodoTool(pi: ExtensionAPI): void {
	const todosDirLabel = resolveTodosDirLabel(process.cwd());
	pi.registerTool({
		name: "todo",
		label: "Todo",
		description: `Compatibility wrapper for local tasks in ${todosDirLabel}. Prefer task_create/task_update/task_list/task_get/task_complete/task_block/task_delete for new work.`,
		parameters: LegacyTodoParams,
		executionMode: "sequential",
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const store = getStore(ctx);
			await store.initialize();
			return executeLegacyTodo(store, params.action, params, ctx);
		},
		renderCall(args, theme) {
			const id = args.id ? ` ${formatTaskId(args.id)}` : "";
			const title = args.title ? ` "${args.title}"` : "";
			return new Text(taskCallText(theme, `todo ${args.action}${id}${title}`), 0, 0);
		},
		renderResult: renderTaskToolResult,
	});
}

async function executeLegacyTodo(
	store: TaskStore,
	action: LegacyTodoAction,
	params: {
		id?: string;
		title?: string;
		status?: string;
		tags?: string[];
		body?: string;
		force?: boolean;
	},
	ctx: ExtensionContext,
) {
	const sessionId = currentSessionId(ctx);
	if (action === "list" || action === "list-all") {
		const tasks = await store.list({ includeDeleted: action === "list-all" });
		return listResult(tasks, sessionId);
	}
	if (action === "get") {
		if (!params.id) return missingTaskResult("get", "id required");
		const task = await store.get(params.id);
		if (!task) return missingTaskResult("get", `Task ${formatTaskId(params.id)} not found.`);
		return taskResult("get", task);
	}
	if (action === "create") {
		if (!params.title) return missingTaskResult("create", "title required");
		const notes = [params.body?.trim() ?? "", params.tags?.length ? `Tags: ${params.tags.join(", ")}` : ""]
			.filter(Boolean)
			.join("\n\n");
		const result = await store.create(
			{
				title: params.title,
				status: params.status ? toTaskStatus(params.status) : "pending",
				context: notes ? { notes } : undefined,
			},
			sessionId,
		);
		if ("error" in result) return errorResult("create", result.error);
		return taskResult("create", result);
	}
	if (action === "update") {
		if (!params.id) return missingTaskResult("update", "id required");
		const existing = await store.get(params.id);
		const notes = params.body === undefined ? existing?.context?.notes : params.body;
		const result = await store.update(
			{
				id: params.id,
				title: params.title,
				status: params.status ? toTaskStatus(params.status) : undefined,
				context: notes === undefined ? undefined : { ...existing?.context, notes },
			},
			sessionId,
		);
		if ("error" in result) return errorResult("update", result.error);
		return taskResult("update", result);
	}
	if (action === "append") {
		if (!params.id) return missingTaskResult("update", "id required");
		const result = await store.appendNote(params.id, params.body ?? "", sessionId);
		if ("error" in result) return errorResult("update", result.error);
		return taskResult("update", result);
	}
	if (action === "claim") {
		if (!params.id) return missingTaskResult("update", "id required");
		const result = await store.claim(params.id, sessionId, params.force);
		if ("error" in result) return errorResult("update", result.error);
		return taskResult("update", result);
	}
	if (action === "release") {
		if (!params.id) return missingTaskResult("update", "id required");
		const result = await store.release(params.id, sessionId, params.force);
		if ("error" in result) return errorResult("update", result.error);
		return taskResult("update", result);
	}
	if (action === "delete") {
		if (!params.id) return missingTaskResult("delete", "id required");
		const result = await store.softDelete(params.id, undefined, sessionId);
		if ("error" in result) return errorResult("delete", result.error);
		return taskResult("delete", result);
	}
	return missingTaskResult("update", `Unsupported action: ${action}`);
}

function registerTodosCommand(pi: ExtensionAPI): void {
	pi.registerCommand("todos", {
		description: "List local task core items from .pi/todos",
		handler: async (args, ctx) => {
			const store = getStore(ctx);
			await store.initialize();
			const tasks = await store.list();
			const searchTerm = (args ?? "").trim();
			const sessionId = currentSessionId(ctx);
			if (!ctx.hasUI) {
				console.log(formatTaskList(tasks));
				return;
			}

			let nextPrompt: string | null = null;
			await ctx.ui.custom<void>((tui, theme, keybindings, done) => {
				let selector: TaskSelectorComponent | null = null;
				let actionMenu: TaskActionMenuComponent | null = null;
				let activeComponent: {
					render: (width: number) => string[];
					invalidate: () => void;
					handleInput?: (data: string) => void;
					focused?: boolean;
				} | null = null;
				let wrapperFocused = false;

				const setActiveComponent = (component: typeof activeComponent) => {
					if (activeComponent && "focused" in activeComponent) activeComponent.focused = false;
					activeComponent = component;
					if (activeComponent && "focused" in activeComponent) activeComponent.focused = wrapperFocused;
					tui.requestRender();
				};

				const refreshTasks = async () => {
					selector?.setTasks(await store.list());
				};

				const copyTaskPathToClipboard = (taskId: string) => {
					const filePath = path.resolve(store.getTaskPath(taskId));
					copyToClipboard(filePath);
					ctx.ui.notify(`Copied ${filePath} to clipboard`, "info");
				};

				const copyTaskTextToClipboard = (task: TaskRecord) => {
					const context = task.context?.notes ? `\n\n${task.context.notes}` : "";
					copyToClipboard(`# ${task.title}${context}`);
					ctx.ui.notify("Copied task text to clipboard", "info");
				};

				const openTaskOverlay = async (task: TaskRecord): Promise<"back" | "work"> => {
					const action = await ctx.ui.custom<"back" | "work">(
						(overlayTui, overlayTheme, overlayKeybindings, overlayDone) =>
							new TaskDetailOverlayComponent(overlayTui, overlayTheme, overlayKeybindings, task, overlayDone),
						{ overlay: true, overlayOptions: { width: "80%", maxHeight: "80%", anchor: "center" } },
					);
					return action ?? "back";
				};

				const applyTaskAction = async (task: TaskRecord, action: string): Promise<"stay" | "exit"> => {
					if (action === "refine") {
						nextPrompt = buildRefinePrompt(task.id, task.title || "(untitled)");
						done();
						return "exit";
					}
					if (action === "work") {
						nextPrompt = `work on task ${formatTaskId(task.id)} "${task.title || "(untitled)"}"`;
						await store.update({ id: task.id, status: "in_progress", assignedToSession: sessionId }, sessionId);
						done();
						return "exit";
					}
					if (action === "copyPath") {
						copyTaskPathToClipboard(task.id);
						return "stay";
					}
					if (action === "copyText") {
						copyTaskTextToClipboard(task);
						return "stay";
					}
					if (action === "release") {
						const result = await store.release(task.id, sessionId, true);
						if ("error" in result) ctx.ui.notify(result.error.message, "error");
						else ctx.ui.notify(`Released task ${formatTaskId(task.id)}`, "info");
						await refreshTasks();
						return "stay";
					}
					if (action === "delete") {
						const result = await store.softDelete(task.id, undefined, sessionId);
						if ("error" in result) ctx.ui.notify(result.error.message, "error");
						else ctx.ui.notify(`Deleted task ${formatTaskId(task.id)}`, "info");
						await refreshTasks();
						return "stay";
					}
					const status = action === "close" ? "completed" : "pending";
					const result = await store.update({ id: task.id, status }, sessionId);
					if ("error" in result) ctx.ui.notify(result.error.message, "error");
					else
						ctx.ui.notify(
							`${status === "completed" ? "Completed" : "Reopened"} task ${formatTaskId(task.id)}`,
							"info",
						);
					await refreshTasks();
					return "stay";
				};

				const handleActionSelection = async (task: TaskRecord, action: string) => {
					if (action === "view") {
						const overlayAction = await openTaskOverlay(task);
						if (overlayAction === "work") await applyTaskAction(task, "work");
						else if (actionMenu) setActiveComponent(actionMenu);
						return;
					}
					if (action === "delete") {
						const confirm = new TaskDeleteConfirmComponent(
							theme,
							`Delete task ${formatTaskId(task.id)}?`,
							(confirmed) => {
								if (!confirmed) {
									setActiveComponent(actionMenu);
									return;
								}
								void (async () => {
									await applyTaskAction(task, "delete");
									setActiveComponent(selector);
								})();
							},
						);
						setActiveComponent(confirm);
						return;
					}
					const result = await applyTaskAction(task, action);
					if (result === "stay") setActiveComponent(selector);
				};

				const showActionMenu = (task: TaskRecord) => {
					actionMenu = new TaskActionMenuComponent(
						theme,
						task,
						(action) => {
							void handleActionSelection(task, action);
						},
						() => setActiveComponent(selector),
					);
					setActiveComponent(actionMenu);
				};

				selector = new TaskSelectorComponent(
					tui,
					theme,
					keybindings,
					tasks,
					showActionMenu,
					() => done(),
					searchTerm || undefined,
					sessionId,
				);
				setActiveComponent(selector);

				return {
					get focused() {
						return wrapperFocused;
					},
					set focused(value: boolean) {
						wrapperFocused = value;
						if (activeComponent && "focused" in activeComponent) activeComponent.focused = value;
					},
					render(width: number) {
						return activeComponent ? activeComponent.render(width) : [];
					},
					invalidate() {
						activeComponent?.invalidate();
					},
					handleInput(data: string) {
						activeComponent?.handleInput?.(data);
					},
				};
			});

			if (nextPrompt) {
				ctx.ui.setEditorText(nextPrompt);
			}
		},
	});
}

function renderTaskToolResult(
	result: { content: Array<{ type: string; text?: string }>; details?: TaskToolDetails },
	{ expanded, isPartial }: { expanded: boolean; isPartial?: boolean },
	theme: Theme,
): Text {
	if (isPartial) return new Text(theme.fg("warning", "Processing..."), 0, 0);
	const details = result.details;
	if (!details) return new Text(result.content[0]?.text ?? "", 0, 0);
	if (details.error) return new Text(theme.fg("error", `Error: ${details.error.message}`), 0, 0);
	if (details.action === "list") {
		const tasks = details.tasks ?? [];
		let text = renderTaskList(theme, tasks, expanded, details.currentSessionId);
		if (!expanded && tasks.some((task) => task.status === "completed")) text = appendExpandHint(theme, text);
		return new Text(text, 0, 0);
	}
	if (!details.task) return new Text(result.content[0]?.text ?? "", 0, 0);
	let text = renderTaskDetail(theme, details.task, expanded);
	const actionLabel = {
		create: "Created",
		update: "Updated",
		complete: "Completed",
		block: "Blocked",
		delete: "Deleted",
		get: null,
		list: null,
	}[details.action];
	if (actionLabel) {
		const lines = text.split("\n");
		lines[0] = theme.fg("success", "+ ") + theme.fg("muted", `${actionLabel} `) + lines[0];
		text = lines.join("\n");
	}
	if (!expanded) text = appendExpandHint(theme, text);
	return new Text(text, 0, 0);
}

function taskCallText(theme: Theme, action: string, detail?: string): string {
	let text = theme.fg("toolTitle", theme.bold("task ")) + theme.fg("muted", action);
	if (detail) text += ` ${theme.fg("accent", detail)}`;
	return text;
}
