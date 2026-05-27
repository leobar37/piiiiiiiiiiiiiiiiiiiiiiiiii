import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { LionEvents } from "./events/defs.js";
import { loadLionPlan, resolvePlanReference } from "./plans/index.js";
import type { LionRuntime } from "./runtime.js";
import type { LionToolResponse } from "./tools.js";
import { createRunId } from "./utils.js";

export class PlanActivator {
	runtime: LionRuntime;

	constructor(runtime: LionRuntime) {
		this.runtime = runtime;
	}

	activate(ctx: ExtensionContext, reference: string): LionToolResponse {
		const runId = createRunId();
		const bus = this.runtime.events;
		bus.publish(LionEvents.activateStart, { runId, input: reference });

		const resolution = resolvePlanReference(ctx.cwd, reference);
		if (resolution.status !== "resolved") {
			return {
				run: this.runtime.core.activeRun,
				candidates: resolution.candidates.map(toCandidateResponse),
			};
		}

		const plan = loadLionPlan(resolution.planPath);
		this.runtime.activatePlan(plan);
		this.runtime.persist("activate");
		bus.publish(LionEvents.planLoaded, {
			runId,
			planSlug: plan.slug,
			planPath: plan.rootPath,
			taskCount: plan.tasks.length,
			kind: plan.kind,
		});
		bus.publish(LionEvents.activateComplete, { runId, mode: this.runtime.state.mode });

		return {
			run: this.runtime.core.activeRun,
			plan,
			candidates: resolution.candidates.map(toCandidateResponse),
		};
	}
}

function toCandidateResponse(candidate: {
	slug: string;
	path: string;
	displayPath: string;
	kind: string;
	reason: string;
}) {
	return {
		slug: candidate.slug,
		path: candidate.path,
		displayPath: candidate.displayPath,
		kind: candidate.kind,
		reason: candidate.reason,
	};
}
