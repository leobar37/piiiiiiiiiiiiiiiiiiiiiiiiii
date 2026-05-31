import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { SubAgentEvent } from "../types.js";

interface PersistedEventRecord {
	instanceId: string;
	event: SubAgentEvent;
	timestamp: number;
}

/**
 * Persistent append-only store for subagent events.
 *
 * Each instance gets its own .jsonl file under `{cwd}/.lion/dashboard-events/`.
 * This allows the dashboard to reconstruct historical state after a browser
 * reload or even a full Pi restart.
 */
export class SubAgentEventStore {
	private readonly dir: string;

	constructor(cwd: string) {
		this.dir = join(cwd, ".lion", "dashboard-events");
	}

	async append(instanceId: string, event: SubAgentEvent): Promise<void> {
		// Skip streaming deltas and raw message_end — only persist complete messages
		// and state events. Real-time streaming consumers receive deltas via SSE.
		// message_end is covered by session.message.complete which has the full message.
		if (event.type === "session.event") {
			const sessionEvent = (event as { sessionEvent?: { type?: string } }).sessionEvent;
			if (sessionEvent?.type === "message_update" || sessionEvent?.type === "message_end") {
				return;
			}
		}

		const file = this.resolveFile(instanceId);
		await mkdir(this.dir, { recursive: true });
		const record: PersistedEventRecord = {
			instanceId,
			event,
			timestamp: Date.now(),
		};
		await appendFile(file, `${JSON.stringify(record)}\n`, "utf-8");
	}

	async read(instanceId: string): Promise<SubAgentEvent[]> {
		const file = this.resolveFile(instanceId);
		if (!existsSync(file)) return [];
		const content = await readFile(file, "utf-8");
		const events: SubAgentEvent[] = [];
		for (const line of content.split("\n")) {
			if (!line.trim()) continue;
			try {
				const record = JSON.parse(line) as PersistedEventRecord;
				events.push(record.event);
			} catch {
				/* skip malformed */
			}
		}
		return events;
	}

	async readAllInstanceIds(): Promise<string[]> {
		if (!existsSync(this.dir)) return [];
		const files = await readdir(this.dir);
		return files.filter((f) => f.endsWith(".events.jsonl")).map((f) => basename(f, ".events.jsonl"));
	}

	private resolveFile(instanceId: string): string {
		return join(this.dir, `${instanceId}.events.jsonl`);
	}
}
