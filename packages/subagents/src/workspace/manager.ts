import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SubAgentWorkspaceOptions {
	taskId: string;
	relativeCwd?: string;
	isolated?: boolean;
}

export interface SubAgentWorkspaceHandle {
	cwd: string;
	isolated: boolean;
	cleanup(): Promise<void>;
}

export interface WorktreeEntry {
	path: string;
	HEAD: string;
	branch: string;
}

function parseWorktreeList(output: string): WorktreeEntry[] {
	const entries: WorktreeEntry[] = [];
	let current: Partial<WorktreeEntry> = {};

	for (const line of output.trim().split("\n")) {
		if (line.startsWith("worktree ")) {
			if (current.path) {
				entries.push({
					path: current.path,
					HEAD: current.HEAD ?? "",
					branch: current.branch ?? "",
				});
			}
			current = { path: line.slice("worktree ".length) };
		} else if (line.startsWith("HEAD ")) {
			current.HEAD = line.slice("HEAD ".length);
		} else if (line.startsWith("branch ")) {
			current.branch = line.slice("branch ".length);
		}
	}

	if (current.path) {
		entries.push({
			path: current.path,
			HEAD: current.HEAD ?? "",
			branch: current.branch ?? "",
		});
	}

	return entries;
}

export class SubAgentWorkspace {
	private rootCwd: string;

	constructor(rootCwd: string) {
		this.rootCwd = rootCwd;
	}

	async prepare(options: SubAgentWorkspaceOptions): Promise<SubAgentWorkspaceHandle> {
		let cwd = this.rootCwd;
		let isolated = false;

		if (options.relativeCwd) {
			cwd = resolve(this.rootCwd, options.relativeCwd);
		}

		if (options.isolated) {
			const worktreePath = mkdtempSync(join(tmpdir(), `pi-subagent-${options.taskId}-`));
			await execFileAsync("git", ["worktree", "add", "--detach", worktreePath], {
				cwd: this.rootCwd,
			});
			cwd = worktreePath;
			isolated = true;

			let cleanedUp = false;
			const cleanup = async () => {
				if (cleanedUp) return;
				cleanedUp = true;
				await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], {
					cwd: this.rootCwd,
				});
			};

			return { cwd, isolated, cleanup };
		}

		return {
			cwd,
			isolated: false,
			cleanup: async () => {},
		};
	}

	async list(): Promise<WorktreeEntry[]> {
		const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
			cwd: this.rootCwd,
		});
		return parseWorktreeList(stdout);
	}

	async remove(path: string, force = false): Promise<void> {
		const args = ["worktree", "remove"];
		if (force) {
			args.push("--force");
		}
		args.push(path);
		await execFileAsync("git", args, { cwd: this.rootCwd });
	}

	async prune(): Promise<void> {
		await execFileAsync("git", ["worktree", "prune"], { cwd: this.rootCwd });
	}
}
