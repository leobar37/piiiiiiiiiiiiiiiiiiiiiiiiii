import { DynamicBorder, getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import {
	Container,
	type Focusable,
	Input,
	Markdown,
	type SelectItem,
	SelectList,
	Spacer,
	Text,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { filterTasks, formatContextMarkdown, formatTaskId, isTaskVisible, renderAssignmentSuffix } from "./format.js";
import { isTaskClosed } from "./task-store.js";
import type { KeybindingMatcher, TaskRecord, TodoMenuAction, TodoOverlayAction } from "./types.js";

export class TaskSelectorComponent extends Container implements Focusable {
	private searchInput: Input;
	private listContainer: Container;
	private allTasks: TaskRecord[];
	private filteredTasks: TaskRecord[];
	private selectedIndex = 0;
	private headerText: Text;
	private hintText: Text;
	private _focused = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		private tui: TUI,
		private theme: Theme,
		private keybindings: KeybindingMatcher,
		tasks: TaskRecord[],
		private onSelectCallback: (task: TaskRecord) => void,
		private onCancelCallback: () => void,
		initialSearchInput?: string,
		private currentSessionId?: string,
	) {
		super();
		this.allTasks = tasks;
		this.filteredTasks = tasks;
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		this.addChild(new Spacer(1));
		this.headerText = new Text("", 1, 0);
		this.addChild(this.headerText);
		this.addChild(new Spacer(1));
		this.searchInput = new Input();
		if (initialSearchInput) this.searchInput.setValue(initialSearchInput);
		this.searchInput.onSubmit = () => {
			const selected = this.filteredTasks[this.selectedIndex];
			if (selected) this.onSelectCallback(selected);
		};
		this.addChild(this.searchInput);
		this.addChild(new Spacer(1));
		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.hintText = new Text("", 1, 0);
		this.addChild(this.hintText);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		this.updateHeader();
		this.updateHints();
		this.applyFilter(this.searchInput.getValue());
	}

	setTasks(tasks: TaskRecord[]): void {
		this.allTasks = tasks;
		this.updateHeader();
		this.applyFilter(this.searchInput.getValue());
		this.tui.requestRender();
	}

	private updateHeader(): void {
		const visible = this.allTasks.filter(isTaskVisible);
		const openCount = visible.filter((task) => !isTaskClosed(task.status)).length;
		const closedCount = visible.length - openCount;
		this.headerText.setText(
			this.theme.fg("accent", this.theme.bold(`Tasks (${openCount} open, ${closedCount} closed)`)),
		);
	}

	private updateHints(): void {
		this.hintText.setText(this.theme.fg("dim", "Type to search - up/down select - Enter actions - Esc close"));
	}

	private applyFilter(query: string): void {
		this.filteredTasks = filterTasks(this.allTasks.filter(isTaskVisible), query);
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredTasks.length - 1));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();
		if (this.filteredTasks.length === 0) {
			this.listContainer.addChild(new Text(this.theme.fg("muted", "  No matching tasks"), 0, 0));
			return;
		}
		const maxVisible = 10;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredTasks.length - maxVisible),
		);
		const endIndex = Math.min(startIndex + maxVisible, this.filteredTasks.length);
		for (let i = startIndex; i < endIndex; i += 1) {
			const task = this.filteredTasks[i];
			if (!task) continue;
			const isSelected = i === this.selectedIndex;
			const closed = isTaskClosed(task.status);
			const prefix = isSelected ? this.theme.fg("accent", "> ") : "  ";
			const titleColor = isSelected ? "accent" : closed ? "dim" : "text";
			const statusColor = closed ? "dim" : task.status === "blocked" ? "warning" : "success";
			const assignmentText = renderAssignmentSuffix(this.theme, task, this.currentSessionId);
			const line =
				prefix +
				this.theme.fg("accent", formatTaskId(task.id)) +
				" " +
				this.theme.fg(titleColor, task.title || "(untitled)") +
				assignmentText +
				" " +
				this.theme.fg(statusColor, `(${task.status})`);
			this.listContainer.addChild(new Text(line, 0, 0));
		}
		if (startIndex > 0 || endIndex < this.filteredTasks.length) {
			this.listContainer.addChild(
				new Text(this.theme.fg("dim", `  (${this.selectedIndex + 1}/${this.filteredTasks.length})`), 0, 0),
			);
		}
	}

	handleInput(keyData: string): void {
		const kb = this.keybindings;
		if (kb.matches(keyData, "tui.select.up")) {
			if (this.filteredTasks.length === 0) return;
			this.selectedIndex = this.selectedIndex === 0 ? this.filteredTasks.length - 1 : this.selectedIndex - 1;
			this.updateList();
			return;
		}
		if (kb.matches(keyData, "tui.select.down")) {
			if (this.filteredTasks.length === 0) return;
			this.selectedIndex = this.selectedIndex === this.filteredTasks.length - 1 ? 0 : this.selectedIndex + 1;
			this.updateList();
			return;
		}
		if (kb.matches(keyData, "tui.select.confirm")) {
			const selected = this.filteredTasks[this.selectedIndex];
			if (selected) this.onSelectCallback(selected);
			return;
		}
		if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
			return;
		}
		this.searchInput.handleInput(keyData);
		this.applyFilter(this.searchInput.getValue());
	}

	override invalidate(): void {
		super.invalidate();
		this.updateHeader();
		this.updateHints();
		this.updateList();
	}
}

export class TaskActionMenuComponent extends Container {
	private selectList: SelectList;

	constructor(theme: Theme, task: TaskRecord, onSelect: (action: TodoMenuAction) => void, onCancel: () => void) {
		super();
		const closed = isTaskClosed(task.status);
		const title = task.title || "(untitled)";
		const options: SelectItem[] = [
			{ value: "view", label: "view", description: "View task context" },
			{ value: "work", label: "work", description: "Work on task" },
			{ value: "refine", label: "refine", description: "Refine task" },
			...(task.status === "blocked"
				? [{ value: "reopen", label: "reopen", description: "Move task back to pending" }]
				: []),
			...(closed
				? [{ value: "reopen", label: "reopen", description: "Reopen task" }]
				: [{ value: "close", label: "complete", description: "Complete task" }]),
			...(task.assignedToSession ? [{ value: "release", label: "release", description: "Release assignment" }] : []),
			{ value: "copyPath", label: "copy path", description: "Copy legacy task path to clipboard" },
			{ value: "copyText", label: "copy text", description: "Copy task text to clipboard" },
			{ value: "delete", label: "delete", description: "Soft-delete task" },
		];
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		this.addChild(new Text(theme.fg("accent", theme.bold(`Actions for ${formatTaskId(task.id)} "${title}"`))));
		this.selectList = new SelectList(options, options.length, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});
		this.selectList.onSelect = (item) => onSelect(item.value as TodoMenuAction);
		this.selectList.onCancel = onCancel;
		this.addChild(this.selectList);
		this.addChild(new Text(theme.fg("dim", "Enter to confirm - Esc back")));
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
	}

	handleInput(keyData: string): void {
		this.selectList.handleInput(keyData);
	}
}

export class TaskDeleteConfirmComponent extends Container {
	private selectList: SelectList;

	constructor(theme: Theme, message: string, onConfirm: (confirmed: boolean) => void) {
		super();
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		this.addChild(new Text(theme.fg("accent", message)));
		this.selectList = new SelectList(
			[
				{ value: "yes", label: "Yes" },
				{ value: "no", label: "No" },
			],
			2,
			{
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		);
		this.selectList.onSelect = (item) => onConfirm(item.value === "yes");
		this.selectList.onCancel = () => onConfirm(false);
		this.addChild(this.selectList);
		this.addChild(new Text(theme.fg("dim", "Enter to confirm - Esc back")));
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
	}

	handleInput(keyData: string): void {
		this.selectList.handleInput(keyData);
	}
}

export class TaskDetailOverlayComponent {
	private markdown: Markdown;
	private scrollOffset = 0;
	private viewHeight = 0;
	private totalLines = 0;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private keybindings: KeybindingMatcher,
		private task: TaskRecord,
		private onAction: (action: TodoOverlayAction) => void,
	) {
		this.markdown = new Markdown(formatContextMarkdown(task), 1, 0, getMarkdownTheme());
	}

	handleInput(keyData: string): void {
		const kb = this.keybindings;
		if (kb.matches(keyData, "tui.select.cancel")) {
			this.onAction("back");
			return;
		}
		if (kb.matches(keyData, "tui.select.confirm")) {
			this.onAction("work");
			return;
		}
		if (kb.matches(keyData, "tui.select.up")) {
			this.scrollBy(-1);
			return;
		}
		if (kb.matches(keyData, "tui.select.down")) {
			this.scrollBy(1);
			return;
		}
		if (kb.matches(keyData, "tui.select.pageUp")) {
			this.scrollBy(-this.viewHeight || -1);
			return;
		}
		if (kb.matches(keyData, "tui.select.pageDown")) {
			this.scrollBy(this.viewHeight || 1);
		}
	}

	render(width: number): string[] {
		const maxHeight = Math.max(10, Math.floor((this.tui.terminal.rows || 24) * 0.8));
		const innerWidth = Math.max(10, width - 2);
		const contentHeight = Math.max(1, maxHeight - 8);
		const markdownLines = this.markdown.render(innerWidth);
		this.totalLines = markdownLines.length;
		this.viewHeight = contentHeight;
		const maxScroll = Math.max(0, this.totalLines - contentHeight);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
		const visibleLines = markdownLines.slice(this.scrollOffset, this.scrollOffset + contentHeight);
		const lines = [this.buildTitleLine(innerWidth), this.buildMetaLine(innerWidth), "", ...visibleLines];
		while (lines.length < 3 + contentHeight) lines.push("");
		lines.push("");
		lines.push(this.buildActionLine(innerWidth));
		const borderColor = (text: string) => this.theme.fg("borderMuted", text);
		const top = borderColor(`+${"-".repeat(innerWidth)}+`);
		const bottom = borderColor(`+${"-".repeat(innerWidth)}+`);
		const framed = lines.map((line) => {
			const truncated = truncateToWidth(line, innerWidth);
			const padding = Math.max(0, innerWidth - visibleWidth(truncated));
			return borderColor("|") + truncated + " ".repeat(padding) + borderColor("|");
		});
		return [top, ...framed, bottom].map((line) => truncateToWidth(line, width));
	}

	invalidate(): void {
		this.markdown = new Markdown(formatContextMarkdown(this.task), 1, 0, getMarkdownTheme());
	}

	private buildTitleLine(width: number): string {
		const titleText = this.task.title ? ` ${this.task.title} ` : ` Task ${formatTaskId(this.task.id)} `;
		const titleWidth = visibleWidth(titleText);
		if (titleWidth >= width) return truncateToWidth(this.theme.fg("accent", titleText.trim()), width);
		const leftWidth = Math.max(0, Math.floor((width - titleWidth) / 2));
		const rightWidth = Math.max(0, width - titleWidth - leftWidth);
		return (
			this.theme.fg("borderMuted", "-".repeat(leftWidth)) +
			this.theme.fg("accent", titleText) +
			this.theme.fg("borderMuted", "-".repeat(rightWidth))
		);
	}

	private buildMetaLine(width: number): string {
		const statusColor = isTaskClosed(this.task.status)
			? "dim"
			: this.task.status === "blocked"
				? "warning"
				: "success";
		const line =
			this.theme.fg("accent", formatTaskId(this.task.id)) +
			this.theme.fg("muted", " - ") +
			this.theme.fg(statusColor, this.task.status) +
			this.theme.fg("muted", ` - rev ${this.task.revision}`);
		return truncateToWidth(line, width);
	}

	private buildActionLine(width: number): string {
		let line =
			this.theme.fg("accent", "enter") +
			this.theme.fg("muted", " work on task - ") +
			this.theme.fg("dim", "esc back - up/down scroll");
		if (this.totalLines > this.viewHeight) {
			const start = Math.min(this.totalLines, this.scrollOffset + 1);
			const end = Math.min(this.totalLines, this.scrollOffset + this.viewHeight);
			line += this.theme.fg("dim", ` ${start}-${end}/${this.totalLines}`);
		}
		return truncateToWidth(line, width);
	}

	private scrollBy(delta: number): void {
		const maxScroll = Math.max(0, this.totalLines - this.viewHeight);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset + delta, maxScroll));
	}
}
