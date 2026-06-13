import type { SubAgentController } from "../controller.js";
import type { LionChecklistService } from "../lion/checklist-service.js";
import type { LionStrategyName } from "../lion/types.js";
import type { SubAgentRunStore } from "../run-store.js";
import type { TaskService } from "../tasks/service.js";
import type { DashboardStateManager } from "../transport/state-manager.js";
import type { DashboardLionState, DashboardSessionSource } from "../transport/types.js";
import type { SubAgentEvent } from "../types.js";
import type { DashboardThreadSessionCache } from "./session-control.js";
import type { DashboardSessionLogStore } from "./session-log-store.js";
import type { StandaloneSessionManager } from "./standalone-sessions.js";

export interface SubagentsApiContext {
	controller: SubAgentController;
	runStore: SubAgentRunStore;
	stateManager: DashboardStateManager;
	mainSession?: DashboardSessionSource;
	lionState?: () => DashboardLionState;
	setLionStrategy?(strategy: LionStrategyName): Promise<void> | void;
	checklistService: LionChecklistService;
	taskService: TaskService;
	sessionCache: DashboardThreadSessionCache;
	logStore: DashboardSessionLogStore;
	emitEvent(event: SubAgentEvent): void;
	cwd: string;
	standaloneSessions: StandaloneSessionManager;
}
