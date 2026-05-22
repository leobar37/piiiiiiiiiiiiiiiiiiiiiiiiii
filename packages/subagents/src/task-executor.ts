import type { SubAgentController } from "./controller.js";
import type { DelegationResult, DelegationTask, ExecutionPlan, SubAgentEvent } from "./types.js";

export interface TaskExecutorOptions {
	controller: SubAgentController;
	onEvent?: (event: SubAgentEvent) => void;
}

export interface TaskExecutionResult {
	plan: ExecutionPlan;
	results: DelegationResult[];
	completedAt: number;
}

export class TaskExecutor {
	private controller: SubAgentController;
	private onEvent?: (event: SubAgentEvent) => void;
	private abortController = new AbortController();

	constructor(options: TaskExecutorOptions) {
		this.controller = options.controller;
		this.onEvent = options.onEvent;
	}

	async execute(plan: ExecutionPlan): Promise<TaskExecutionResult> {
		this.abortController = new AbortController();

		switch (plan.strategy) {
			case "sequential":
				return this.executeSequential(plan);
			case "parallel":
				return this.executeParallel(plan);
			case "chain":
				return this.executeChain(plan);
			default:
				throw new Error(`Unknown execution strategy: ${(plan as { strategy: string }).strategy}`);
		}
	}

	cancel(): void {
		this.abortController.abort();
	}

	private async executeSequential(plan: ExecutionPlan): Promise<TaskExecutionResult> {
		const results: DelegationResult[] = [];

		for (const task of plan.tasks) {
			if (this.abortController.signal.aborted) {
				break;
			}
			const result = await this.executeTask(task);
			results.push(result);
		}

		return { plan, results, completedAt: Date.now() };
	}

	private async executeParallel(plan: ExecutionPlan): Promise<TaskExecutionResult> {
		const concurrency = plan.concurrency ?? 3;
		const executing = new Set<Promise<void>>();
		const results: DelegationResult[] = new Array(plan.tasks.length);

		const queue = plan.tasks.map((task, index) => ({ task, index }));
		let cursor = 0;

		const pump = async (): Promise<void> => {
			while (cursor < queue.length) {
				if (this.abortController.signal.aborted) break;
				const { task, index } = queue[cursor++];
				const promise = this.executeTask(task).then((result) => {
					results[index] = result;
				});
				executing.add(promise);

				if (executing.size >= concurrency) {
					await Promise.race(executing);
				}
			}
		};

		await pump();
		await Promise.all(executing);

		return { plan, results, completedAt: Date.now() };
	}

	private async executeChain(plan: ExecutionPlan): Promise<TaskExecutionResult> {
		const options = plan.chainOptions ?? {};
		const passOutputToNext = options.passOutputToNext ?? true;
		const outputMode = options.outputMode ?? "append";
		const template = options.template ?? "Previous result: {{output}}\n\n{{prompt}}";
		const stopOnFailure = options.stopOnFailure ?? true;

		const results: DelegationResult[] = [];
		let previousOutput = "";

		for (let i = 0; i < plan.tasks.length; i++) {
			if (this.abortController.signal.aborted) {
				break;
			}

			let task = plan.tasks[i];

			if (passOutputToNext && i > 0) {
				task = this.injectOutput(task, previousOutput, outputMode, template);
			}

			const result = await this.executeTask(task);
			results.push(result);
			previousOutput = result.summary;

			if (stopOnFailure && result.status !== "completed") {
				break;
			}
		}

		return { plan, results, completedAt: Date.now() };
	}

	private injectOutput(
		task: DelegationTask,
		output: string,
		mode: "append" | "replace" | "template",
		template: string,
	): DelegationTask {
		switch (mode) {
			case "append":
				return { ...task, prompt: `${task.prompt}\n\nPrevious result:\n${output}` };
			case "replace":
				return { ...task, prompt: output };
			case "template":
				return {
					...task,
					prompt: template.replace(/\{\{output\}\}/g, output).replace(/\{\{prompt\}\}/g, task.prompt),
				};
		}
	}

	private async executeTask(task: DelegationTask): Promise<DelegationResult> {
		const instance = this.controller.createInstance(task);

		const unsubscribe = this.controller.getEventBus().subscribe((event: SubAgentEvent) => {
			if ("instanceId" in event && event.instanceId === instance.instanceId) {
				this.onEvent?.(event);
			}
		});

		try {
			const result = await instance.start();
			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				taskId: task.id,
				agent: task.definition,
				status: "failed",
				summary: errorMessage,
				duration: 0,
				turnCount: 0,
				finalState: instance.getState(),
			};
		} finally {
			unsubscribe();
		}
	}
}
