import type { SubAgentInstance } from "../instance.js";
import type { DelegationResult, DelegationTask, SubAgentEvent } from "../types.js";

export interface ChainOptions {
	passOutputToNext?: boolean;
	outputMode?: "append" | "replace" | "template";
	template?: string;
	stopOnFailure?: boolean;
}

export async function executeChain(
	instances: SubAgentInstance[],
	tasks: DelegationTask[],
	options: ChainOptions = {},
	_onEvent?: (event: SubAgentEvent) => void,
): Promise<DelegationResult[]> {
	const {
		passOutputToNext = true,
		outputMode = "append",
		template = "Previous result: {{output}}\n\n{{prompt}}",
		stopOnFailure = true,
	} = options;

	const results: DelegationResult[] = [];
	let previousOutput = "";

	for (let i = 0; i < instances.length; i++) {
		const instance = instances[i];
		let task = tasks[i];

		if (passOutputToNext && i > 0) {
			task = injectOutput(task, previousOutput, outputMode, template);
		}

		// Update the instance task reference before starting
		(instance as unknown as { task: DelegationTask }).task = task;

		const result = await instance.start();
		results.push(result);
		previousOutput = result.summary;

		if (stopOnFailure && result.status !== "completed") {
			break;
		}
	}

	return results;
}

function injectOutput(
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
