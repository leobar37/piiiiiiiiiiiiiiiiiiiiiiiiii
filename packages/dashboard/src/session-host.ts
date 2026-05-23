import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentSessionEvent, CreateAgentSessionOptions } from "@earendil-works/pi-coding-agent";
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { EventPublisher } from "@orpc/server";

// ============================================================================
// Types
// ============================================================================

export type SessionStatus = "created" | "starting" | "idle" | "streaming" | "error" | "stopped";

export interface LiveSessionInfo {
	id: string;
	name?: string;
	status: SessionStatus;
	sessionFile?: string;
	cwd: string;
	createdAt: number;
	lastActivityAt: number;
	messageCount: number;
}

export interface SessionHostConfig {
	/** Default working directory for new sessions */
	defaultCwd?: string;
	/** Custom sessions directory (default: derived from cwd) */
	sessionsDir?: string;
	/** Maximum concurrently running sessions (default: 10) */
	maxActiveSessions?: number;
	/** Auto-stop idle sessions after N ms (default: 30 min) */
	idleTimeoutMs?: number;
}

// ============================================================================
// LiveSession
// ============================================================================

/**
 * A single live session that may or may not have an active AgentSession runtime.
 *
 * Lifecycle:
 *   created -> start() -> starting -> idle <-> streaming -> stop() -> stopped
 *                         |
 *                         +-> error
 */
export class LiveSession {
	readonly id: string;
	readonly sessionManager: SessionManager;
	readonly eventPublisher = new EventPublisher<Record<string, AgentSessionEvent>>();

	private _status: SessionStatus = "created";
	private _agentSession: AgentSessionLike | null = null;
	private _eventUnsubscribe?: () => void;
	private _lastActivityAt: number;
	private readonly _createdAt: number;

	constructor(sessionManager: SessionManager) {
		this.sessionManager = sessionManager;
		this.id = sessionManager.getSessionId();
		this._lastActivityAt = Date.now();

		const header = sessionManager.getHeader();
		this._createdAt = header?.timestamp ? new Date(header.timestamp).getTime() : Date.now();
	}

	// -------------------------------------------------------------------------
	// Read-only accessors
	// -------------------------------------------------------------------------

	get status(): SessionStatus {
		return this._status;
	}

	get lastActivityAt(): number {
		return this._lastActivityAt;
	}

	get cwd(): string {
		return this.sessionManager.getCwd();
	}

	get info(): LiveSessionInfo {
		const entries = this.sessionManager.getEntries();
		return {
			id: this.id,
			name: this.sessionManager.getSessionName(),
			status: this._status,
			sessionFile: this.sessionManager.getSessionFile(),
			cwd: this.cwd,
			createdAt: this._createdAt,
			lastActivityAt: this._lastActivityAt,
			messageCount: entries.filter((e) => e.type === "message").length,
		};
	}

	// -------------------------------------------------------------------------
	// Runtime lifecycle
	// -------------------------------------------------------------------------

	/**
	 * Start (or resume) the agent runtime for this session.
	 *
	 * Uses the existing SessionManager state so resuming a persisted session
	 * restores its conversation history automatically.
	 */
	async start(options?: Omit<CreateAgentSessionOptions, "cwd" | "sessionManager">): Promise<void> {
		if (this._status === "starting" || this._status === "idle" || this._status === "streaming") {
			return; // already running
		}

		this._status = "starting";

		try {
			const result = await createAgentSession({
				cwd: this.cwd,
				sessionManager: this.sessionManager,
				...options,
			});

			this._agentSession = result.session;
			this._status = "idle";
			this._touch();

			this._eventUnsubscribe = result.session.subscribe((event) => {
				this.eventPublisher.publish("*", event);
				this._touch();

				if (event.type === "agent_start") {
					this._status = "streaming";
				} else if (event.type === "agent_end") {
					this._status = "idle";
				}
			});
		} catch (err) {
			this._status = "error";
			throw err;
		}
	}

	/**
	 * Stop the runtime. The session remains in the host registry and its
	 * conversation history is persisted to disk by SessionManager.
	 */
	async stop(): Promise<void> {
		if (this._agentSession) {
			this._eventUnsubscribe?.();
			this._eventUnsubscribe = undefined;
			this._agentSession.dispose();
			this._agentSession = null;
		}
		this._status = "stopped";
	}

	// -------------------------------------------------------------------------
	// Interaction (requires running runtime)
	// -------------------------------------------------------------------------

	async prompt(message: string, opts?: { streamingBehavior?: "steer" | "followUp" }): Promise<void> {
		this._requireRuntime();
		this._touch();
		await this._agentSession!.prompt(message, {
			streamingBehavior: opts?.streamingBehavior,
			source: "api",
		});
	}

	async steer(message: string): Promise<void> {
		this._requireRuntime();
		this._touch();
		await this._agentSession!.steer(message);
	}

	async followUp(message: string): Promise<void> {
		this._requireRuntime();
		this._touch();
		await this._agentSession!.followUp(message);
	}

	async abort(): Promise<void> {
		this._requireRuntime();
		this._touch();
		await this._agentSession!.abort();
	}

	// -------------------------------------------------------------------------
	// State access
	// -------------------------------------------------------------------------

	getMessages(): AgentMessage[] {
		if (!this._agentSession) {
			// No runtime yet — return what SessionManager can reconstruct from disk
			return this.sessionManager.buildSessionContext().messages;
		}
		return this._agentSession.messages;
	}

	getState(): {
		status: SessionStatus;
		isStreaming: boolean;
		isCompacting: boolean;
		pendingMessageCount: number;
		messageCount: number;
	} {
		if (!this._agentSession) {
			return {
				status: this._status,
				isStreaming: false,
				isCompacting: false,
				pendingMessageCount: 0,
				messageCount: this.getMessages().length,
			};
		}
		return {
			status: this._status,
			isStreaming: this._agentSession.isStreaming,
			isCompacting: this._agentSession.isCompacting,
			pendingMessageCount: this._agentSession.pendingMessageCount,
			messageCount: this._agentSession.messages.length,
		};
	}

	// -------------------------------------------------------------------------
	// Internal
	// -------------------------------------------------------------------------

	private _requireRuntime(): void {
		if (!this._agentSession) {
			throw new Error(`Session ${this.id} has no active runtime. Call start() first.`);
		}
		if (this._status === "error") {
			throw new Error(`Session ${this.id} is in error state.`);
		}
	}

	private _touch(): void {
		this._lastActivityAt = Date.now();
	}
}

// Minimal interface duck-type for AgentSession so we avoid a heavy import.
interface AgentSessionLike {
	prompt(text: string, options?: { streamingBehavior?: "steer" | "followUp"; source?: string }): Promise<void>;
	steer(text: string): Promise<void>;
	followUp(text: string): Promise<void>;
	abort(): Promise<void>;
	subscribe(listener: (event: AgentSessionEvent) => void): () => void;
	dispose(): void;
	readonly isStreaming: boolean;
	readonly isCompacting: boolean;
	readonly pendingMessageCount: number;
	readonly messages: AgentMessage[];
}

// ============================================================================
// SessionHost
// ============================================================================

/**
 * Registry and lifecycle manager for multiple live sessions.
 *
 * Each session is identified by its sessionId and backed by a SessionManager
 * (disk persistence). Sessions can be created, started, stopped, and removed.
 * Only started sessions have an active AgentSession runtime.
 */
export class SessionHost {
	private sessions = new Map<string, LiveSession>();
	private config: {
		defaultCwd: string;
		sessionsDir: string | undefined;
		maxActiveSessions: number;
		idleTimeoutMs: number;
	};

	constructor(config?: SessionHostConfig) {
		this.config = {
			defaultCwd: config?.defaultCwd ?? process.cwd(),
			sessionsDir: config?.sessionsDir ?? undefined,
			maxActiveSessions: config?.maxActiveSessions ?? 10,
			idleTimeoutMs: config?.idleTimeoutMs ?? 1000 * 60 * 30,
		};
	}

	// -------------------------------------------------------------------------
	// CRUD
	// -------------------------------------------------------------------------

	/** Create a brand-new session on disk. */
	async create(cwd?: string): Promise<LiveSession> {
		const sessionCwd = cwd ?? this.config.defaultCwd;
		const manager = SessionManager.create(sessionCwd, this.config.sessionsDir);
		const live = new LiveSession(manager);
		this.sessions.set(live.id, live);
		return live;
	}

	/** Open an existing session file. */
	async open(sessionFile: string, cwdOverride?: string): Promise<LiveSession> {
		const manager = SessionManager.open(sessionFile, this.config.sessionsDir, cwdOverride);
		const live = new LiveSession(manager);
		this.sessions.set(live.id, live);
		return live;
	}

	/** Continue the most recent session for a cwd, or create new if none. */
	async continueRecent(cwd?: string): Promise<LiveSession> {
		const sessionCwd = cwd ?? this.config.defaultCwd;
		const manager = SessionManager.continueRecent(sessionCwd, this.config.sessionsDir);
		const live = new LiveSession(manager);
		this.sessions.set(live.id, live);
		return live;
	}

	/** Get a live session by id. */
	get(sessionId: string): LiveSession | undefined {
		return this.sessions.get(sessionId);
	}

	/** List all sessions known to the host. */
	list(): LiveSessionInfo[] {
		return Array.from(this.sessions.values()).map((s) => s.info);
	}

	/** Remove a session from the host and stop its runtime if running. */
	async remove(sessionId: string): Promise<boolean> {
		const session = this.sessions.get(sessionId);
		if (!session) return false;
		await session.stop();
		this.sessions.delete(sessionId);
		return true;
	}

	// -------------------------------------------------------------------------
	// Runtime control
	// -------------------------------------------------------------------------

	/** Start (or resume) a session's agent runtime. */
	async start(sessionId: string, options?: Omit<CreateAgentSessionOptions, "cwd" | "sessionManager">): Promise<void> {
		const session = this._requireSession(sessionId);

		const activeCount = Array.from(this.sessions.values()).filter(
			(s) => s.status === "idle" || s.status === "streaming",
		).length;

		if (activeCount >= this.config.maxActiveSessions) {
			throw new Error(`Max active sessions reached (${this.config.maxActiveSessions})`);
		}

		await session.start(options);
	}

	/** Stop a session's runtime (conversation is persisted). */
	async stop(sessionId: string): Promise<void> {
		const session = this._requireSession(sessionId);
		await session.stop();
	}

	// -------------------------------------------------------------------------
	// Interaction
	// -------------------------------------------------------------------------

	async prompt(
		sessionId: string,
		message: string,
		opts?: { streamingBehavior?: "steer" | "followUp" },
	): Promise<void> {
		await this._requireSession(sessionId).prompt(message, opts);
	}

	async steer(sessionId: string, message: string): Promise<void> {
		await this._requireSession(sessionId).steer(message);
	}

	async followUp(sessionId: string, message: string): Promise<void> {
		await this._requireSession(sessionId).followUp(message);
	}

	async abort(sessionId: string): Promise<void> {
		await this._requireSession(sessionId).abort();
	}

	// -------------------------------------------------------------------------
	// Maintenance
	// -------------------------------------------------------------------------

	/** Stop and evict sessions that have been idle longer than configured. */
	cleanupIdleSessions(): string[] {
		const now = Date.now();
		const removed: string[] = [];

		for (const [id, session] of this.sessions) {
			if (session.status === "idle" || session.status === "stopped" || session.status === "created") {
				if (now - session.lastActivityAt > this.config.idleTimeoutMs) {
					session.stop().catch(() => {});
					this.sessions.delete(id);
					removed.push(id);
				}
			}
		}

		return removed;
	}

	/** Stop all sessions. Call before server shutdown. */
	async dispose(): Promise<void> {
		for (const session of this.sessions.values()) {
			await session.stop();
		}
		this.sessions.clear();
	}

	// -------------------------------------------------------------------------
	// Internal
	// -------------------------------------------------------------------------

	private _requireSession(sessionId: string): LiveSession {
		const session = this.sessions.get(sessionId);
		if (!session) throw new Error(`Session ${sessionId} not found`);
		return session;
	}
}
