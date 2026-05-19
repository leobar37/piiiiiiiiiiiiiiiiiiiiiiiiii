import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { LionEvent } from "../types.js";

export class LionEventStore {
	constructor(private readonly cwd: string) {}

	save(event: LionEvent): void {
		const dir = join(this.cwd, ".lion", "runs");
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		appendFileSync(join(dir, `${event.runId}.events.jsonl`), `${JSON.stringify(event)}\n`, "utf-8");
	}
}
