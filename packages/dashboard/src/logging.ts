/**
 * DashboardLogger — structured in-memory logging with level filtering.
 *
 * Provides a circular buffer of recent log entries and an HTTP endpoint
 * for remote debugging. All logs are timestamped and include optional
 * context (sessionId, requestId, etc.).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	context?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export class DashboardLogger {
	private buffer: LogEntry[] = [];
	private readonly maxSize: number;
	private minLevel: LogLevel;
	private consoleOutput: boolean;

	constructor(options?: { maxSize?: number; minLevel?: LogLevel; consoleOutput?: boolean }) {
		this.maxSize = options?.maxSize ?? 1000;
		this.minLevel = options?.minLevel ?? "debug";
		this.consoleOutput = options?.consoleOutput ?? false;
	}

	setConsoleOutput(enabled: boolean): void {
		this.consoleOutput = enabled;
	}

	setMinLevel(level: LogLevel): void {
		this.minLevel = level;
	}

	private shouldLog(level: LogLevel): boolean {
		return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
	}

	private push(entry: LogEntry): void {
		this.buffer.push(entry);
		if (this.buffer.length > this.maxSize) {
			this.buffer.shift();
		}
		if (this.consoleOutput) {
			const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
			const msg = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${ctx}`;
			// eslint-disable-next-line no-console
			const fn = console[entry.level] ?? console.log;
			fn(msg);
		}
	}

	debug(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog("debug")) return;
		this.push({ timestamp: new Date().toISOString(), level: "debug", message, context });
	}

	info(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog("info")) return;
		this.push({ timestamp: new Date().toISOString(), level: "info", message, context });
	}

	warn(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog("warn")) return;
		this.push({ timestamp: new Date().toISOString(), level: "warn", message, context });
	}

	error(message: string, context?: Record<string, unknown>): void {
		if (!this.shouldLog("error")) return;
		this.push({ timestamp: new Date().toISOString(), level: "error", message, context });
	}

	/**
	 * Get recent logs with optional filtering.
	 */
	getLogs(options?: { level?: LogLevel; limit?: number; sessionId?: string }): LogEntry[] {
		let result = this.buffer;

		if (options?.level) {
			const minPriority = LOG_LEVEL_PRIORITY[options.level];
			result = result.filter((e) => LOG_LEVEL_PRIORITY[e.level] >= minPriority);
		}

		if (options?.sessionId) {
			result = result.filter((e) => e.context?.sessionId === options.sessionId);
		}

		const limit = options?.limit ?? 100;
		return result.slice(-limit);
	}

	clear(): void {
		this.buffer = [];
	}

	get size(): number {
		return this.buffer.length;
	}
}

/** Global logger instance shared across the dashboard server. */
export const logger = new DashboardLogger();
