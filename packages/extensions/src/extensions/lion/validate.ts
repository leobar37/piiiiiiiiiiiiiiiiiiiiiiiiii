import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DelegationTask, SubAgentEvent } from "@local/pi-subagents";
import { LionEvents } from "./events/defs.js";
import { loadLionPlan } from "./plans/index.js";
import { buildPlanReviewPrompt } from "./prompts/index.js";
import type { LionRuntime } from "./runtime.js";
import type { LionToolResponse } from "./tools.js";
import type { LionPlan, LionTask } from "./types.js";
import { renderLionSubagentWidget } from "./ui/subagents-widget.js";
import { createRunId } from "./utils.js";

export class Validator {
	runtime: LionRuntime;

	constructor(runtime: LionRuntime) {
		this.runtime = runtime;
	}

	async validate(ctx: ExtensionContext, focus?: string): Promise<LionToolResponse> {
		const activePlanPath = this.runtime.state.activePlanPath;
		if (!activePlanPath)
			throw new Error("Lion validate requires an active plan. Run /lion-activate or lion_activate_plan first.");
		this.runtime.rememberUiContext(ctx);

		const runId = createRunId();
		const bus = this.runtime.events;
		const plan = loadLionPlan(activePlanPath);
		const task = createPlanValidationTask(plan);
		const prompt = buildPlanReviewPrompt(plan, focus);
		const validatorTaskId = `${plan.slug}-validator-${runId}`;

		bus.publish(LionEvents.validationStart, {
			runId,
			planSlug: plan.slug,
			planPath: plan.rootPath,
			taskId: task.id,
			focus,
		});

		this.runtime.startJob({ runId, taskId: validatorTaskId, role: "validator", title: task.title });
		this.runtime.startSubagentUi({ runId, taskId: validatorTaskId, role: "validator", title: task.title });
		renderLionSubagentWidget(this.runtime, ctx);

		const controller = this.runtime.createSubAgentController(ctx, runId);

		const unsubscribeEvents = controller.getEventBus().subscribe((event: SubAgentEvent) => {
			if (!("taskId" in event)) return;
			this.runtime.recordSubagentUiEvent(event);
			bus.publish(LionEvents.subagentEvent, {
				runId,
				planSlug: plan.slug,
				planPath: plan.rootPath,
				taskId: validatorTaskId,
				subagentEvent: event,
			});
		});

		const delegationTask: DelegationTask = {
			id: validatorTaskId,
			definition: "executor",
			description: `Validate and fix Lion plan ${plan.slug}`,
			prompt,
			systemPromptMode: "append",
			capabilities: { canEdit: true, canWrite: true, canExecute: false, canResearch: true },
		};

		try {
			const result = await controller.executeTask(delegationTask);
			unsubscribeEvents();
			this.runtime.finishJob(result.taskId, result);
			renderLionSubagentWidget(this.runtime, ctx);

			bus.publish(LionEvents.validationEnd, {
				runId,
				planSlug: plan.slug,
				planPath: plan.rootPath,
				taskId: result.taskId,
				status: result.status,
				summary: result.summary,
			});

			return {
				run: this.runtime.core.activeRun,
				validation: { status: result.status, summary: result.summary, taskId: result.taskId },
			};
		} catch (err: unknown) {
			unsubscribeEvents();
			const error = err instanceof Error ? err.message : String(err);
			this.runtime.finishJob(validatorTaskId, null, error);
			bus.publish(LionEvents.validationEnd, {
				runId,
				planSlug: plan.slug,
				planPath: plan.rootPath,
				taskId: validatorTaskId,
				status: "failed",
				summary: error,
			});
			throw new Error(`Lion validation failed: ${error}`);
		} finally {
			this.runtime.controllers.delete(runId);
			if (this.runtime.activeRunId === runId) {
				this.runtime.activeRunId = null;
				this.runtime.activeController = null;
			}
		}
	}
}

function createPlanValidationTask(plan: LionPlan): LionTask {
	return {
		id: `validate-${plan.slug}`,
		title: `Validate plan ${plan.slug}`,
		file: "task-index.md",
		status: "pending",
		dependencies: [],
		requirements: [],
	};
}
