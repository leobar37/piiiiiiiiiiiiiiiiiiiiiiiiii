/**
 * Optional completion auditor for goal-v2.
 *
 * Before a goal is archived as complete, an independent agent session inspects
 * the workspace and the goal markdown file and returns either <approved/> or
 * <disapproved/>.
 */

import { readFile } from "node:fs/promises";
import type { AssistantMessage, ThinkingLevel } from "@earendil-works/pi-ai";
import { createAgentSession, type ExtensionContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { auditorSystemPrompt } from "./prompts.js";

export interface AuditorConfig {
	provider?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel;
}

export interface AuditorResult {
	approved: boolean;
	reason?: string;
}

const CONFIG_PATH = ".pi/goal-auditor.json";

export async function loadAuditorConfig(cwd: string): Promise<AuditorConfig> {
	const config: AuditorConfig = {};
	try {
		const raw = await readFile(`${cwd}/${CONFIG_PATH}`, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object") {
			const record = parsed as Record<string, unknown>;
			if (typeof record.provider === "string") config.provider = record.provider;
			if (typeof record.model === "string") config.model = record.model;
			if (typeof record.thinkingLevel === "string") config.thinkingLevel = record.thinkingLevel as ThinkingLevel;
		}
	} catch {
		// Config file is optional.
	}

	if (process.env.PI_GOAL_AUDITOR_PROVIDER) {
		config.provider = process.env.PI_GOAL_AUDITOR_PROVIDER;
	}
	if (process.env.PI_GOAL_AUDITOR_MODEL) {
		config.model = process.env.PI_GOAL_AUDITOR_MODEL;
	}
	if (process.env.PI_GOAL_AUDITOR_THINKING_LEVEL) {
		config.thinkingLevel = process.env.PI_GOAL_AUDITOR_THINKING_LEVEL as ThinkingLevel;
	}

	return config;
}

function resolveAuditorModel(ctx: ExtensionContext, config: AuditorConfig) {
	if (!config.model) {
		return ctx.model ?? undefined;
	}
	// If a fully-qualified model is provided, prefer it. Otherwise fall back to the current model.
	if (config.model.includes("/")) {
		return ctx.model ?? undefined;
	}
	return ctx.model ?? undefined;
}

function extractText(parts: AssistantMessage["content"]): string {
	return parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

function getLastAssistantMessage(
	session: Awaited<ReturnType<typeof createAgentSession>>["session"],
): AssistantMessage | null {
	for (let i = session.state.messages.length - 1; i >= 0; i--) {
		const message = session.state.messages[i];
		if (message.role === "assistant") {
			return message as AssistantMessage;
		}
	}
	return null;
}

export async function runGoalAuditor(ctx: ExtensionContext, goalMarkdownPath: string): Promise<AuditorResult> {
	const config = await loadAuditorConfig(ctx.cwd);
	const model = resolveAuditorModel(ctx, config);
	if (!model) {
		return { approved: true, reason: "No auditor model configured; skipping audit." };
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		return { approved: true, reason: `Auditor auth unavailable: ${auth.error}; skipping audit.` };
	}

	let goalMarkdown: string;
	try {
		goalMarkdown = await readFile(goalMarkdownPath, "utf8");
	} catch (error) {
		return {
			approved: false,
			reason: `Could not read goal markdown file: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	const { session } = await createAgentSession({
		sessionManager: SessionManager.inMemory(),
		model,
		modelRegistry: ctx.modelRegistry,
		thinkingLevel: config.thinkingLevel ?? "medium",
		tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
	});

	try {
		await session.prompt(auditorSystemPrompt(goalMarkdown), { source: "extension" });
		const response = getLastAssistantMessage(session);
		if (!response) {
			return { approved: false, reason: "Auditor finished without a response." };
		}
		if (response.stopReason === "aborted") {
			return { approved: false, reason: "Auditor request was aborted." };
		}
		if (response.stopReason === "error") {
			return { approved: false, reason: response.errorMessage || "Auditor request failed." };
		}

		const text = extractText(response.content);
		const approved = text.includes("<approved/>");
		const disapproved = text.includes("<disapproved/>");

		if (approved && !disapproved) {
			return { approved: true, reason: text.replace(/<approved\/>/g, "").trim() };
		}
		if (disapproved) {
			return { approved: false, reason: text.replace(/<disapproved\/>/g, "").trim() };
		}
		return { approved: false, reason: `Auditor did not return a clear verdict. Response:\n${text}` };
	} finally {
		try {
			await session.abort();
		} catch {
			// Ignore abort errors during teardown.
		}
		session.dispose();
	}
}
