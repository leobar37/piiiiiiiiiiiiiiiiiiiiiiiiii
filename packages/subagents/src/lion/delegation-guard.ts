import type { ToolCallEvent, ToolCallEventResult, ToolResultEvent } from "@earendil-works/pi-coding-agent";

const MAX_DELEGATION_DEPTH = 3;
const CHECKLIST_FILE_PATTERN = /(^|\/)(?:\.plans|\.reviews)\/[^/]+\/checklist\.json$/;
const CHECKLIST_FILE_TOOLS = new Set(["read", "edit", "write", "multi-edit"]);

export class LionDelegationGuard {
	#depthMap = new Map<string, number>();
	#activeToolCalls = new Map<string, string>();

	startTurn(): void {
		// Compatibility hook for builds that still notify the guard per turn.
	}

	endTurn(): void {
		// Compatibility hook for builds that still notify the guard per turn.
	}

	handleToolCall(event: ToolCallEvent): ToolCallEventResult | undefined {
		const checklistResult = blockChecklistFileAccess(event);
		if (checklistResult) return checklistResult;

		if (event.toolName !== "lion_tasks") return undefined;

		const threadId = "main";
		const currentDepth = this.#depthMap.get(threadId) ?? 0;

		if (currentDepth >= MAX_DELEGATION_DEPTH) {
			return {
				block: true,
				reason: `Delegation depth limit (${MAX_DELEGATION_DEPTH}) reached. Cannot nest lion_tasks further.`,
			};
		}

		this.#depthMap.set(threadId, currentDepth + 1);
		this.#activeToolCalls.set(event.toolCallId, threadId);
		return undefined;
	}

	handleToolResult(event: ToolResultEvent): void {
		if (event.toolName !== "lion_tasks") return;
		const threadId = this.#activeToolCalls.get(event.toolCallId);
		if (!threadId) return;
		this.#activeToolCalls.delete(event.toolCallId);
		this.releaseDepth(threadId);
	}

	releaseDepth(threadId: string): void {
		const current = this.#depthMap.get(threadId) ?? 0;
		if (current > 0) {
			this.#depthMap.set(threadId, current - 1);
		}
	}

	getDepth(threadId: string): number {
		return this.#depthMap.get(threadId) ?? 0;
	}

	reset(): void {
		this.#depthMap.clear();
		this.#activeToolCalls.clear();
	}
}

function blockChecklistFileAccess(event: ToolCallEvent): ToolCallEventResult | undefined {
	if (!CHECKLIST_FILE_TOOLS.has(event.toolName)) return undefined;
	const path = findChecklistPath(event.input);
	if (!path) return undefined;
	return {
		block: true,
		reason: [
			`Direct ${event.toolName} access to ${path} is not allowed in Lion mode.`,
			"Use lion_checklist_read, lion_checklist_start_next, or lion_checklist_record instead.",
		].join(" "),
	};
}

function findChecklistPath(input: unknown): string | null {
	if (typeof input === "string") return isChecklistPath(input) ? input : null;
	if (!input || typeof input !== "object") return null;

	if (Array.isArray(input)) {
		for (const item of input) {
			const path = findChecklistPath(item);
			if (path) return path;
		}
		return null;
	}

	for (const value of Object.values(input as Record<string, unknown>)) {
		const path = findChecklistPath(value);
		if (path) return path;
	}
	return null;
}

function isChecklistPath(path: string): boolean {
	return CHECKLIST_FILE_PATTERN.test(path.replaceAll("\\", "/"));
}
