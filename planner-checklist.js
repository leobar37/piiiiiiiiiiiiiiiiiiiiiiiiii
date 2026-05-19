#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , command, planName, taskId] = process.argv;

function usage() {
	console.log(`Usage:
  node ./planner-checklist.js list <plan-name>
  node ./planner-checklist.js remaining <plan-name>
  node ./planner-checklist.js next <plan-name>
  node ./planner-checklist.js start <plan-name> <task-id>
  node ./planner-checklist.js complete <plan-name> <task-id>
  node ./planner-checklist.js block <plan-name> <task-id>
  node ./planner-checklist.js reset <plan-name> <task-id>`);
}

function checklistPath(name) {
	return join(process.cwd(), ".plans", name, "checklist.json");
}

function loadChecklist(name) {
	if (!name) {
		usage();
		process.exit(1);
	}
	const path = checklistPath(name);
	if (!existsSync(path)) {
		console.error(`Checklist not found: ${path}`);
		process.exit(1);
	}
	return { path, checklist: JSON.parse(readFileSync(path, "utf-8")) };
}

function getTasks(checklist) {
	if (!Array.isArray(checklist.tasks)) {
		console.error("Invalid checklist: tasks must be an array");
		process.exit(1);
	}
	return checklist.tasks;
}

function printTasks(tasks) {
	for (const task of tasks) {
		console.log(`${task.id}\t${task.status}\t${task.title ?? task.name ?? ""}`);
	}
}

function dependenciesComplete(task, tasks) {
	const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
	return deps.every((dep) => tasks.find((candidate) => candidate.id === dep)?.status === "complete");
}

function updateTaskStatus(name, id, status) {
	if (!id) {
		usage();
		process.exit(1);
	}
	const { path, checklist } = loadChecklist(name);
	const tasks = getTasks(checklist);
	const task = tasks.find((candidate) => candidate.id === id);
	if (!task) {
		console.error(`Task not found: ${id}`);
		process.exit(1);
	}
	task.status = status;
	writeFileSync(path, `${JSON.stringify(checklist, null, 2)}\n`, "utf-8");
	console.log(`${id}\t${status}`);
}

switch (command) {
	case "list": {
		const { checklist } = loadChecklist(planName);
		printTasks(getTasks(checklist));
		break;
	}
	case "remaining": {
		const { checklist } = loadChecklist(planName);
		printTasks(getTasks(checklist).filter((task) => task.status !== "complete"));
		break;
	}
	case "next": {
		const { checklist } = loadChecklist(planName);
		const tasks = getTasks(checklist);
		printTasks(tasks.filter((task) => task.status === "pending" && dependenciesComplete(task, tasks)));
		break;
	}
	case "start":
		updateTaskStatus(planName, taskId, "in_progress");
		break;
	case "complete":
		updateTaskStatus(planName, taskId, "complete");
		break;
	case "block":
		updateTaskStatus(planName, taskId, "blocked");
		break;
	case "reset":
		updateTaskStatus(planName, taskId, "pending");
		break;
	default:
		usage();
		process.exit(command ? 1 : 0);
}
