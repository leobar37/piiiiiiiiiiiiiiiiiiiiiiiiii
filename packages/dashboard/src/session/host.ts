/**
 * SessionHost — registry and lifecycle manager for live sessions.
 *
 * Manages multiple LiveSessions, wires them to EventStreamProvider
 * for event forwarding to frontend subscribers.
 */

import type { CreateAgentSessionOptions } from "@earendil-works/pi-coding-agent";
import {
	AuthStorage,
	getAgentDir,
	getModelsPath,
	ModelRegistry,
	SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { EventStreamProvider } from "../events/provider.js";
import { logger } from "../logging.js";
import { LiveSession } from "./live-session.js";
import type { LiveSessionInfo, SessionHostConfig } from "./types.js";

export class SessionHost {
	private sessions = new Map<string, LiveSession>();
	private diskSessionFiles = new Map<string, string>();
	private config: {
		defaultCwd: string;
		sessionsDir: string | undefined;
		maxActiveSessions: number;
		idleTimeoutMs: number;
	};
	private eventProvider: EventStreamProvider | null = null;
	private modelRegistry: ModelRegistry;

	constructor(config?: SessionHostConfig) {
		this.config = {
			defaultCwd: config?.defaultCwd ?? process.cwd(),
			sessionsDir: config?.sessionsDir,
			maxActiveSessions: config?.maxActiveSessions ?? 10,
			idleTimeoutMs: config?.idleTimeoutMs ?? 1000 * 60 * 30,
		};

		const authStorage = AuthStorage.create(getAgentDir());
		this.modelRegistry = ModelRegistry.create(authStorage, getModelsPath());
	}

	/**
	 * Attach an EventStreamProvider. New sessions will be automatically
	 * wired to forward events to the provider.
	 */
	setEventProvider(provider: EventStreamProvider): void {
		this.eventProvider = provider;
		// Wire up already-registered sessions
		for (const session of this.sessions.values()) {
			session.setEventProvider(provider);
		}
	}

	/**
	 * Emit a server-originated session lifecycle event.
	 */
	private emitSessionEvent(
		sessionId: string,
		type: "session_created" | "session_started" | "session_stopped" | "session_removed",
	): void {
		this.eventProvider?.publish({
			sessionId,
			timestamp: Date.now(),
			type,
		});
	}

	// -------------------------------------------------------------------------
	// CRUD
	// -------------------------------------------------------------------------

	async create(cwd?: string): Promise<LiveSession> {
		const sessionCwd = cwd ?? this.config.defaultCwd;
		logger.info("Creating session", { cwd: sessionCwd });
		const manager = SessionManager.create(sessionCwd, this.config.sessionsDir);
		const live = new LiveSession(manager, this.eventProvider ?? undefined, this.modelRegistry);
		this.sessions.set(live.id, live);
		this.emitSessionEvent(live.id, "session_created");
		logger.info("Session created", { sessionId: live.id, cwd: live.cwd });
		return live;
	}

	async open(sessionFile: string, cwdOverride?: string): Promise<LiveSession> {
		const manager = SessionManager.open(sessionFile, this.config.sessionsDir, cwdOverride);
		const live = new LiveSession(manager, this.eventProvider ?? undefined, this.modelRegistry);
		this.sessions.set(live.id, live);
		this.emitSessionEvent(live.id, "session_created");
		return live;
	}

	async continueRecent(cwd?: string): Promise<LiveSession> {
		const sessionCwd = cwd ?? this.config.defaultCwd;
		const manager = SessionManager.continueRecent(sessionCwd, this.config.sessionsDir);
		const live = new LiveSession(manager, this.eventProvider ?? undefined, this.modelRegistry);
		this.sessions.set(live.id, live);
		this.emitSessionEvent(live.id, "session_created");
		return live;
	}

	/**
	 * Create a Lion session that listens to an external event source.
	 *
	 * Injects `LION_DASHBOARD_MODE=true` into the environment.
	 * The caller should attach a LionRuntime event source via
	 * `session.setExternalEventSource()` before calling `start()`.
	 */
	async createLionSession(
		plan: unknown,
		options?: {
			cwd?: string;
			env?: Record<string, string>;
		},
	): Promise<{ session: LiveSession; plan: unknown }> {
		const sessionCwd = options?.cwd ?? this.config.defaultCwd;
		logger.info("Creating lion session", { cwd: sessionCwd });
		const manager = SessionManager.create(sessionCwd, this.config.sessionsDir);
		const live = new LiveSession(manager, this.eventProvider ?? undefined, this.modelRegistry, "lion");

		// Inject Lion dashboard mode env var
		// NOTE: This mutates global process.env. In a concurrent server context,
		// multiple Lion sessions could interfere. The coding-agent runtime reads
		// env at process startup, so this is acceptable for now, but a future
		// refactor should pass env explicitly to the child process.
		process.env.LION_DASHBOARD_MODE = "true";
		if (options?.env) {
			for (const [key, value] of Object.entries(options.env)) {
				process.env[key] = value;
			}
		}

		this.sessions.set(live.id, live);
		this.emitSessionEvent(live.id, "session_created");
		logger.info("Lion session created", { sessionId: live.id, cwd: live.cwd });
		return { session: live, plan };
	}

	get(sessionId: string): LiveSession | undefined {
		return this.sessions.get(sessionId);
	}

	/**
	 * Get a session, attempting lazy-load from disk if not in memory.
	 * Returns undefined only if the session truly doesn't exist anywhere.
	 */
	async resolve(sessionId: string): Promise<LiveSession | undefined> {
		const live = this.sessions.get(sessionId);
		if (live) return live;

		const sessionFile = this.diskSessionFiles.get(sessionId);
		if (!sessionFile) return undefined;

		logger.info("Lazy-loading session from disk", { sessionId, sessionFile });
		const manager = SessionManager.open(sessionFile, this.config.sessionsDir);
		const loaded = new LiveSession(manager, this.eventProvider ?? undefined, this.modelRegistry);
		this.sessions.set(loaded.id, loaded);
		logger.info("Session lazy-loaded", { sessionId: loaded.id, cwd: loaded.cwd });
		return loaded;
	}

	async list(cwd?: string): Promise<LiveSessionInfo[]> {
		const sessionCwd = cwd ?? this.config.defaultCwd;
		logger.debug("Listing sessions", { requestedCwd: cwd, resolvedCwd: sessionCwd });
		const diskSessions = await SessionManager.list(sessionCwd, this.config.sessionsDir);
		const seen = new Set<string>();

		const result: LiveSessionInfo[] = [];

		for (const disk of diskSessions) {
			seen.add(disk.id);
			this.diskSessionFiles.set(disk.id, disk.path);
			const live = this.sessions.get(disk.id);
			if (live) {
				result.push(live.info);
			} else {
				result.push({
					id: disk.id,
					name: disk.name,
					status: "stopped" as const,
					isActive: false,
					sessionFile: disk.path,
					cwd: disk.cwd || sessionCwd,
					createdAt: disk.created.getTime(),
					lastActivityAt: disk.modified.getTime(),
					messageCount: disk.messageCount,
				});
			}
		}

		for (const live of this.sessions.values()) {
			if (!seen.has(live.id)) {
				result.push(live.info);
			}
		}

		logger.debug("Sessions listed", {
			count: result.length,
			diskCount: diskSessions.length,
			liveCount: this.sessions.size,
		});
		return result;
	}

	async listAll(): Promise<LiveSessionInfo[]> {
		logger.debug("Listing all sessions");
		const diskSessions = await SessionManager.listAll();
		const seen = new Set<string>();
		const result: LiveSessionInfo[] = [];

		for (const disk of diskSessions) {
			seen.add(disk.id);
			this.diskSessionFiles.set(disk.id, disk.path);
			const live = this.sessions.get(disk.id);
			if (live) {
				result.push(live.info);
			} else {
				result.push({
					id: disk.id,
					name: disk.name,
					status: "stopped" as const,
					isActive: false,
					sessionFile: disk.path,
					cwd: disk.cwd,
					createdAt: disk.created.getTime(),
					lastActivityAt: disk.modified.getTime(),
					messageCount: disk.messageCount,
				});
			}
		}

		for (const live of this.sessions.values()) {
			if (!seen.has(live.id)) {
				result.push(live.info);
			}
		}

		return result;
	}

	async remove(sessionId: string): Promise<boolean> {
		const session = this.sessions.get(sessionId);
		if (!session) return false;
		await session.stop();
		this.sessions.delete(sessionId);
		this.emitSessionEvent(sessionId, "session_removed");
		return true;
	}

	// -------------------------------------------------------------------------
	// Runtime control
	// -------------------------------------------------------------------------

	async start(sessionId: string, options?: Omit<CreateAgentSessionOptions, "cwd" | "sessionManager">): Promise<void> {
		const session = await this._resolveSession(sessionId);
		logger.info("Starting session", { sessionId, currentStatus: session.status });

		if (session.status !== "idle" && session.status !== "streaming" && session.status !== "starting") {
			const activeCount = Array.from(this.sessions.values()).filter(
				(s) => s.status === "starting" || s.status === "idle" || s.status === "streaming",
			).length;

			if (activeCount >= this.config.maxActiveSessions) {
				logger.warn("Max active sessions reached", { sessionId, activeCount, max: this.config.maxActiveSessions });
				throw new Error(`Max active sessions reached (${this.config.maxActiveSessions})`);
			}
		}

		try {
			await session.start(options);
			this.emitSessionEvent(sessionId, "session_started");
			logger.info("Session started", { sessionId });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error("Failed to start session", { sessionId, error: message });
			throw err;
		}
	}

	async stop(sessionId: string): Promise<void> {
		const session = await this._resolveSession(sessionId);
		await session.stop();
		this.emitSessionEvent(sessionId, "session_stopped");
	}

	// -------------------------------------------------------------------------
	// Interaction
	// -------------------------------------------------------------------------

	async prompt(
		sessionId: string,
		message: string,
		opts?: { streamingBehavior?: "steer" | "followUp" },
	): Promise<void> {
		logger.info("Prompt received", { sessionId, streamingBehavior: opts?.streamingBehavior });
		try {
			const session = await this._resolveSession(sessionId);
			await this._ensureStarted(session);
			await session.prompt(message, opts);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error("Prompt failed", { sessionId, error: message });
			throw err;
		}
	}

	async steer(sessionId: string, message: string): Promise<void> {
		logger.info("Steer received", { sessionId });
		try {
			const session = await this._resolveSession(sessionId);
			await this._ensureStarted(session);
			await session.steer(message);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error("Steer failed", { sessionId, error: message });
			throw err;
		}
	}

	async followUp(sessionId: string, message: string): Promise<void> {
		logger.info("FollowUp received", { sessionId });
		try {
			const session = await this._resolveSession(sessionId);
			await this._ensureStarted(session);
			await session.followUp(message);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error("FollowUp failed", { sessionId, error: message });
			throw err;
		}
	}

	async abort(sessionId: string): Promise<void> {
		logger.info("Abort received", { sessionId });
		try {
			const session = await this._resolveSession(sessionId);
			await session.abort();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error("Abort failed", { sessionId, error: message });
			throw err;
		}
	}

	// -------------------------------------------------------------------------
	// Maintenance
	// -------------------------------------------------------------------------

	cleanupIdleSessions(): string[] {
		const now = Date.now();
		const removed: string[] = [];

		for (const [id, session] of this.sessions) {
			const idleDuration = now - session.lastActivityAt;
			if (idleDuration <= this.config.idleTimeoutMs) continue;

			if (session.status === "idle") {
				session.stop().catch(() => {});
			} else if (session.status === "created" || session.status === "stopped" || session.status === "error") {
				session.stop().catch(() => {});
				this.sessions.delete(id);
				removed.push(id);
			}
		}

		return removed;
	}

	async dispose(): Promise<void> {
		for (const session of this.sessions.values()) {
			await session.stop();
		}
		this.sessions.clear();
	}

	// -------------------------------------------------------------------------
	// Model management
	// -------------------------------------------------------------------------

	getAvailableModels(): Array<{ provider: string; id: string; name: string; api: string; reasoning: boolean }> {
		return this.modelRegistry.getAvailable().map((m) => ({
			provider: m.provider,
			id: m.id,
			name: m.name,
			api: m.api,
			reasoning: m.reasoning != null ? m.reasoning : false,
		}));
	}

	getSessionModel(sessionId: string): { provider: string; id: string; name: string } | undefined {
		const session = this.sessions.get(sessionId);
		if (!session) return undefined;
		return session.getModel();
	}

	async setSessionModel(sessionId: string, provider: string, modelId: string): Promise<void> {
		const session = await this._resolveSession(sessionId);
		await this._ensureStarted(session);
		await session.setModel(this.modelRegistry, provider, modelId);
	}

	// -------------------------------------------------------------------------
	// Internal
	// -------------------------------------------------------------------------

	/**
	 * Resolve a session by id. If it's not in memory, attempt to open it from disk.
	 * This enables lazy-loading of sessions that were listed from disk but not yet opened.
	 */
	private async _resolveSession(sessionId: string): Promise<LiveSession> {
		const live = this.sessions.get(sessionId);
		if (live) return live;

		const sessionFile = this.diskSessionFiles.get(sessionId);
		if (!sessionFile) {
			throw new Error(`Session ${sessionId} not found`);
		}

		logger.info("Lazy-loading session from disk", { sessionId, sessionFile });
		const manager = SessionManager.open(sessionFile, this.config.sessionsDir);
		const loaded = new LiveSession(manager, this.eventProvider ?? undefined, this.modelRegistry);
		this.sessions.set(loaded.id, loaded);
		logger.info("Session lazy-loaded", { sessionId: loaded.id, cwd: loaded.cwd });
		return loaded;
	}

	/**
	 * Ensure a session is started before interacting with it.
	 * Auto-starts idle/stopped/created sessions transparently.
	 */
	private async _ensureStarted(session: LiveSession): Promise<void> {
		if (session.status === "idle" || session.status === "streaming" || session.status === "starting") {
			return;
		}
		await this.start(session.id);
	}
}
