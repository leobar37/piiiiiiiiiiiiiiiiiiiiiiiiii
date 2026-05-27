/**
 * LiveSession — a single live session with an optional AgentSession runtime.
 *
 * Lifecycle:
 *   created -> start() -> starting -> idle <-> streaming -> stop() -> stopped
 *                         |
 *                         +-> error
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentSession, AgentSessionEvent, CreateAgentSessionOptions } from "@earendil-works/pi-coding-agent";
import { createAgentSession, type ModelRegistry, type SessionManager } from "@earendil-works/pi-coding-agent";
import { EventPublisher } from "@orpc/server";
import type { EventStreamProvider } from "../events/provider.js";
import { serializeAgentSessionEvent } from "../events/serialize.js";
import { logger } from "../logging.js";
import type { LiveSessionInfo, SessionStatus } from "./types.js";

export class LiveSession {
	readonly id: string;
	readonly sessionManager: SessionManager;
	readonly eventPublisher = new EventPublisher<Record<string, AgentSessionEvent>>();

	private _status: SessionStatus = "created";
	private _agentSession: AgentSession | null = null;
	private _eventUnsubscribe?: () => void;
	private _lastActivityAt: number;
	private readonly _createdAt: number;
	private _eventProvider: EventStreamProvider | null = null;
	private readonly _modelRegistry: ModelRegistry | undefined;

	constructor(sessionManager: SessionManager, eventProvider?: EventStreamProvider, modelRegistry?: ModelRegistry) {
		this.sessionManager = sessionManager;
		this.id = sessionManager.getSessionId();
		this._lastActivityAt = Date.now();
		this._eventProvider = eventProvider ?? null;
		this._modelRegistry = modelRegistry;

		const header = sessionManager.getHeader();
		this._createdAt = header?.timestamp ? new Date(header.timestamp).getTime() : Date.now();
	}

	/**
	 * Set or replace the EventStreamProvider for forwarding events.
	 */
	setEventProvider(provider: EventStreamProvider): void {
		this._eventProvider = provider;
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
			isActive: this._status === "starting" || this._status === "idle" || this._status === "streaming",
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

	async start(options?: Omit<CreateAgentSessionOptions, "cwd" | "sessionManager">): Promise<void> {
		if (this._status === "starting" || this._status === "idle" || this._status === "streaming") {
			logger.debug("Session start skipped — already active", { sessionId: this.id, status: this._status });
			return;
		}

		if (this._status === "error") {
			logger.warn("Session start failed — error state", { sessionId: this.id });
			throw new Error(
				`Session ${this.id} is in error state from a previous start attempt. ` +
					"Resolve the error or remove the session before retrying.",
			);
		}

		this._status = "starting";
		logger.info("Starting agent session", { sessionId: this.id, cwd: this.cwd });

		try {
			const result = await createAgentSession({
				cwd: this.cwd,
				sessionManager: this.sessionManager,
				...options,
				modelRegistry: this._modelRegistry,
			});

			this._agentSession = result.session;
			this._status = "idle";
			this._touch();
			logger.info("Agent session started", { sessionId: this.id });

			this._eventUnsubscribe = result.session.subscribe((event) => {
				// Forward to internal EventPublisher (for legacy consumers)
				this.eventPublisher.publish("*", event);

				// Forward to EventStreamProvider (for SSE subscribers)
				if (this._eventProvider) {
					const serverEvent = serializeAgentSessionEvent(event, this.id);
					this._eventProvider.publish(serverEvent);
				}

				this._touch();

				if (event.type === "agent_start") {
					this._status = "streaming";
				} else if (event.type === "agent_end") {
					this._status = "idle";
				}
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error("Agent session start failed", { sessionId: this.id, error: message });
			this._status = "error";
			throw err;
		}
	}

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
		logger.info("Prompt requested", { sessionId: this.id, status: this._status });
		this._requireRuntime();
		this._touch();
		try {
			await this._agentSession!.prompt(message, {
				streamingBehavior: opts?.streamingBehavior,
				source: "rpc",
			});
			logger.info("Prompt sent to agent", { sessionId: this.id });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error("Prompt failed in agent", { sessionId: this.id, error: errorMessage });
			throw err;
		}
	}

	async steer(message: string): Promise<void> {
		logger.info("Steer requested", { sessionId: this.id, status: this._status });
		this._requireRuntime();
		this._touch();
		try {
			await this._agentSession!.steer(message);
			logger.info("Steer sent to agent", { sessionId: this.id });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error("Steer failed in agent", { sessionId: this.id, error: errorMessage });
			throw err;
		}
	}

	async followUp(message: string): Promise<void> {
		logger.info("FollowUp requested", { sessionId: this.id, status: this._status });
		this._requireRuntime();
		this._touch();
		try {
			await this._agentSession!.followUp(message);
			logger.info("FollowUp sent to agent", { sessionId: this.id });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error("FollowUp failed in agent", { sessionId: this.id, error: errorMessage });
			throw err;
		}
	}

	async abort(): Promise<void> {
		logger.info("Abort requested", { sessionId: this.id, status: this._status });
		this._requireRuntime();
		this._touch();
		try {
			await this._agentSession!.abort();
			logger.info("Abort sent to agent", { sessionId: this.id });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			logger.error("Abort failed in agent", { sessionId: this.id, error: errorMessage });
			throw err;
		}
	}

	// -------------------------------------------------------------------------
	// State access
	// -------------------------------------------------------------------------

	getMessages(): AgentMessage[] {
		if (!this._agentSession) {
			return this.sessionManager.buildSessionContext().messages;
		}
		return this._agentSession.messages;
	}

	getModel(): { provider: string; id: string; name: string } | undefined {
		if (!this._agentSession) return undefined;
		const model = this._agentSession.model;
		if (!model) return undefined;
		return { provider: model.provider, id: model.id, name: model.name };
	}

	async setModel(modelRegistry: ModelRegistry, provider: string, modelId: string): Promise<void> {
		this._requireRuntime();
		const model = modelRegistry.find(provider, modelId);
		if (!model) {
			throw new Error(`Model ${provider}/${modelId} not found`);
		}
		if (!modelRegistry.hasConfiguredAuth(model)) {
			throw new Error(`Model ${provider}/${modelId} has no configured authentication`);
		}
		await this._agentSession!.setModel(model);
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
			logger.warn("Runtime required but not available", { sessionId: this.id, status: this._status });
			throw new Error(`Session ${this.id} has no active runtime. Call start() first.`);
		}
		if (this._status === "error") {
			logger.warn("Runtime required but session in error state", { sessionId: this.id });
			throw new Error(`Session ${this.id} is in error state.`);
		}
	}

	private _touch(): void {
		this._lastActivityAt = Date.now();
	}
}
