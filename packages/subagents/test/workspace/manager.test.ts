import { execSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SubAgentWorkspace } from "../../src/workspace/manager.js";

function createTempGitRepo(): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "pi-test-")));
	execSync("git init", { cwd: dir });
	execSync("git config user.email test@test.com", { cwd: dir });
	execSync("git config user.name test", { cwd: dir });
	writeFileSync(join(dir, "README.md"), "test");
	execSync("git add -A", { cwd: dir });
	execSync("git commit -m init", { cwd: dir });
	return dir;
}

describe("SubAgentWorkspace", () => {
	let rootDir: string;
	let manager: SubAgentWorkspace;
	const worktreeDirs: string[] = [];

	beforeEach(() => {
		rootDir = createTempGitRepo();
		manager = new SubAgentWorkspace(rootDir);
	});

	afterEach(() => {
		worktreeDirs.splice(0).forEach((dir) => {
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {}
		});
		try {
			rmSync(rootDir, { recursive: true, force: true });
		} catch {}
	});

	describe("prepare()", () => {
		it("without isolation returns rootCwd and non-isolated handle", async () => {
			const handle = await manager.prepare({ taskId: "t1" });
			expect(handle.cwd).toBe(rootDir);
			expect(handle.isolated).toBe(false);
			await expect(handle.cleanup()).resolves.toBeUndefined();
		});

		it("with relativeCwd resolves path from rootCwd", async () => {
			const handle = await manager.prepare({ taskId: "t2", relativeCwd: "sub" });
			expect(handle.cwd).toBe(resolve(rootDir, "sub"));
			expect(handle.isolated).toBe(false);
		});

		it("with relativeCwd handles nested paths", async () => {
			const handle = await manager.prepare({
				taskId: "t3",
				relativeCwd: "deeply/nested/path",
			});
			expect(handle.cwd).toBe(resolve(rootDir, "deeply/nested/path"));
			expect(handle.isolated).toBe(false);
		});

		it("with isolated creates detached worktree", async () => {
			const handle = await manager.prepare({ taskId: "t4", isolated: true });
			worktreeDirs.push(handle.cwd);
			expect(handle.cwd).not.toBe(rootDir);
			expect(handle.isolated).toBe(true);
			const stdout = execSync("git rev-parse --show-toplevel", {
				cwd: handle.cwd,
				encoding: "utf-8",
			});
			expect(stdout.trim()).toBe(realpathSync(handle.cwd));
		});
	});

	describe("cleanup()", () => {
		it("removes isolated worktree", async () => {
			const handle = await manager.prepare({ taskId: "t5", isolated: true });
			expect(handle.isolated).toBe(true);

			await handle.cleanup();
			const entries = await manager.list();
			expect(entries.find((e) => e.path === handle.cwd)).toBeUndefined();
		});

		it("is idempotent", async () => {
			const handle = await manager.prepare({ taskId: "t6", isolated: true });
			worktreeDirs.push(handle.cwd);
			await handle.cleanup();
			await expect(handle.cleanup()).resolves.toBeUndefined();
		});
	});

	describe("list()", () => {
		it("returns main worktree entry on fresh repo", async () => {
			const entries = await manager.list();
			expect(entries).toHaveLength(1);
			expect(entries[0].path).toBe(rootDir);
			expect(entries[0].HEAD).toMatch(/^[0-9a-f]{40}$/);
			expect(entries[0].branch).toMatch(/^refs\/heads\//);
		});

		it("includes isolated worktree entries", async () => {
			const handle = await manager.prepare({ taskId: "t7", isolated: true });
			worktreeDirs.push(handle.cwd);

			const entries = await manager.list();
			expect(entries).toHaveLength(2);
			const handleReal = realpathSync(handle.cwd);
			const isolated = entries.find((e) => realpathSync(e.path) === handleReal);
			expect(isolated).toBeDefined();
			expect(isolated!.HEAD).toMatch(/^[0-9a-f]{40}$/);
			expect(isolated!.branch).toBe("");
		});

		it("excludes entry after worktree is removed", async () => {
			const handle = await manager.prepare({ taskId: "t8", isolated: true });
			await manager.remove(handle.cwd);

			const entries = await manager.list();
			expect(entries.find((e) => e.path === handle.cwd)).toBeUndefined();
		});
	});

	describe("remove()", () => {
		it("removes a specific worktree by path", async () => {
			const handle = await manager.prepare({ taskId: "t9", isolated: true });
			await manager.remove(handle.cwd);

			const entries = await manager.list();
			expect(entries).toHaveLength(1);
			expect(entries[0].path).toBe(rootDir);
		});

		it("removes with force flag", async () => {
			const handle = await manager.prepare({ taskId: "t10", isolated: true });
			worktreeDirs.push(handle.cwd);
			await manager.remove(handle.cwd, true);

			const entries = await manager.list();
			expect(entries.find((e) => e.path === handle.cwd)).toBeUndefined();
		});
	});

	describe("prune()", () => {
		it("removes stale worktree metadata", async () => {
			const handle = await manager.prepare({ taskId: "t11", isolated: true });
			worktreeDirs.push(handle.cwd);

			rmSync(handle.cwd, { recursive: true, force: true });
			await manager.prune();

			const entries = await manager.list();
			expect(entries.find((e) => e.path === handle.cwd)).toBeUndefined();
		});

		it("is safe to call on healthy repo", async () => {
			await expect(manager.prune()).resolves.toBeUndefined();
			const entries = await manager.list();
			expect(entries).toHaveLength(1);
		});
	});
});
