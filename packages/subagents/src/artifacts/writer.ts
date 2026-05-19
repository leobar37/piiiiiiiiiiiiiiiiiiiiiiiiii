import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DelegationTask, SubAgentDefinition, SubAgentEvent } from "../types.js";

export function ensureDelegationsDir(artifactsDir: string): void {
	if (!existsSync(artifactsDir)) {
		mkdirSync(artifactsDir, { recursive: true });
	}
}

export function writeDelegationArtifact(
	artifactsDir: string,
	task: DelegationTask,
	definition: SubAgentDefinition,
	contextFiles: Map<string, string>,
): string {
	ensureDelegationsDir(artifactsDir);

	const lines: string[] = [
		`# Delegation: ${task.id}`,
		"",
		`- **Agent**: ${definition.name}`,
		`- **Created**: ${new Date().toISOString()}`,
		`- **Output artifact**: ${task.outputArtifact}`,
		"",
		"## Goal",
		"",
		task.prompt,
	];

	if (contextFiles.size > 0) {
		lines.push("", "## Context");
		for (const [filePath, content] of contextFiles) {
			lines.push("", `### ${filePath}`, "", "```", content, "```");
		}
	}

	lines.push(
		"",
		"## Constraints",
		"",
		`- The agent must write its final result to: \`${task.outputArtifact}\``,
		`- The agent must signal completion by writing a summary to the result artifact`,
		`- Available tools: ${definition.tools?.join(", ") ?? "all (unrestricted)"}`,
		`- Model: ${definition.model ?? "inherited"}`,
		`- Max turns: ${definition.maxTurns ?? "unlimited"}`,
		`- Timeout: ${definition.timeout ?? "none"}`,
	);

	const filePath = join(artifactsDir, `${task.id}.md`);
	writeFileSync(filePath, lines.join("\n"), "utf-8");
	return filePath;
}

export function writeResultArtifact(
	artifactsDir: string,
	taskId: string,
	result: { status: string; summary: string; outputPath: string; turnCount: number; duration: number },
): void {
	ensureDelegationsDir(artifactsDir);

	const lines = [
		`# Result: ${taskId}`,
		"",
		`- **Status**: ${result.status}`,
		`- **Duration**: ${result.duration}ms`,
		`- **Turns**: ${result.turnCount}`,
		"",
		"## Summary",
		"",
		result.summary,
		"",
		"## Output",
		"",
		`See: ${result.outputPath}`,
		"",
		"## Event Log",
		"",
		`See: \`.delegations/${taskId}.events.jsonl\``,
	];

	writeFileSync(join(artifactsDir, `${taskId}.result.md`), lines.join("\n"), "utf-8");
}

export function writeEventLog(artifactsDir: string, taskId: string, events: SubAgentEvent[]): void {
	ensureDelegationsDir(artifactsDir);
	const ndjson = events.map((e) => JSON.stringify(e)).join("\n");
	writeFileSync(join(artifactsDir, `${taskId}.events.jsonl`), ndjson + (ndjson ? "\n" : ""), "utf-8");
}
