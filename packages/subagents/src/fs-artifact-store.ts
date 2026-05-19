import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DelegationResult, SubAgentArtifactStore, SubAgentEvent } from "./types.js";

export class FsArtifactStore implements SubAgentArtifactStore {
	private dir: string;

	constructor(dir: string = ".delegations") {
		this.dir = dir;
		this.ensureDir();
	}

	private ensureDir(): void {
		if (!existsSync(this.dir)) {
			mkdirSync(this.dir, { recursive: true });
		}
	}

	async saveResult(taskId: string, result: DelegationResult): Promise<void> {
		this.ensureDir();
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
			"## Event Log",
			"",
			`See: \`.delegations/${taskId}.events.jsonl\``,
		];
		writeFileSync(join(this.dir, `${taskId}.result.md`), lines.join("\n"), "utf-8");
	}

	async saveEventLog(taskId: string, events: SubAgentEvent[]): Promise<void> {
		this.ensureDir();
		const ndjson = events.map((e) => JSON.stringify(e)).join("\n");
		writeFileSync(join(this.dir, `${taskId}.events.jsonl`), ndjson + (ndjson ? "\n" : ""), "utf-8");
	}

	async readResult(taskId: string): Promise<string | null> {
		const path = join(this.dir, `${taskId}.result.md`);
		if (!existsSync(path)) return null;
		return readFileSync(path, "utf-8");
	}
}
