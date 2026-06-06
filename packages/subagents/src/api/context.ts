import type { SubAgentController } from "../controller.js";
import type { LionChecklistService } from "../lion/checklist-service.js";
import type { SubAgentRunStore } from "../run-store.js";
import type { DashboardStateManager } from "../transport/state-manager.js";
import type { DashboardLionState, DashboardSessionSource } from "../transport/types.js";
import type { SubAgentEvent } from "../types.js";
import type { DashboardThreadSessionCache } from "./session-control.js";

export interface SubagentsApiContext {
	controller: SubAgentController;
	runStore: SubAgentRunStore;
	stateManager: DashboardStateManager;
	mainSession?: DashboardSessionSource;
	lionState?: () => DashboardLionState;
	checklistService: LionChecklistService;
	sessionCache: DashboardThreadSessionCache;
	emitEvent(event: SubAgentEvent): void;
	cwd: string;
}
