import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LionChecklistService } from "../../src/lion/checklist-service.js";
import { buildCodeReviewTodo, type CodeReviewGitContext } from "../../src/lion/code-review.js";
import { createReviewPlanFromTodo } from "../../src/lion/review-plan.js";

const git: CodeReviewGitContext = {
	statusShort: " M src/a.ts\n",
	diffNameOnly: "src/a.ts\n",
	diffStat: " src/a.ts | 1 +\n",
	recentCommitLog: "",
	recentDiffNameOnly: "",
	recentDiffStat: "",
};

describe("LionChecklistService", () => {
	it("starts and records active plan checklist tasks", () => {
		const cwd = mkdtempSync(join(tmpdir(), "lion-checklist-plan-"));
		const rootPath = writePlanFixture(cwd);
		const service = new LionChecklistService();

		try {
			const started = service.startNext({ kind: "plan", activePlanPath: rootPath, cwd });
			expect(started.task?.id).toBe("T-001");
			expect(started.task?.status).toBe("in_progress");
			expect(started.checklist.progress.inProgress).toBe(1);

			const recorded = service.recordResult({
				kind: "plan",
				activePlanPath: rootPath,
				cwd,
				taskId: "T-001",
				status: "complete",
				summary: "Verified implementation",
			});
			expect(recorded.checklist.progress.completed).toBe(1);
			expect(recorded.checklist.tasks[0].last_summary).toBe("Verified implementation");

			const bySlug = service.read({ kind: "plan", reference: "active-feature", cwd });
			expect(bySlug.rootPath).toBe(rootPath);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("starts and records review checklist tasks", () => {
		const cwd = mkdtempSync(join(tmpdir(), "lion-checklist-review-"));
		const service = new LionChecklistService();
		const todo = buildCodeReviewTodo({ scope: "review me", git });
		const review = createReviewPlanFromTodo(cwd, { slug: "review me", todo });

		try {
			const started = service.startNext({ kind: "review", reference: review.rootPath, cwd });
			expect(started.checklist.kind).toBe("review");
			expect(started.task?.id).toBe("R-001");

			const recorded = service.recordResult({
				kind: "review",
				reference: review.rootPath,
				cwd,
				taskId: "R-001",
				status: "blocked",
				summary: "Needs more evidence",
			});
			expect(recorded.checklist.progress.blocked).toBe(1);
			expect(recorded.checklist.tasks[0].last_summary).toBe("Needs more evidence");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});

function writePlanFixture(cwd: string): string {
	const rootPath = join(cwd, ".plans", "active-feature");
	mkdirSync(rootPath, { recursive: true });
	writeFileSync(join(rootPath, "context.md"), "# Context\n", "utf-8");
	writeFileSync(join(rootPath, "requirements.md"), "# Requirements\n", "utf-8");
	writeFileSync(join(rootPath, "task-index.md"), "# active-feature\n", "utf-8");
	writeFileSync(
		join(rootPath, "checklist.json"),
		JSON.stringify(
			{
				completed: 0,
				total_tasks: 2,
				tasks: [
					{
						id: "T-001",
						title: "First task",
						file: "tasks/t-001.md",
						status: "pending",
						dependencies: [],
						requirements: [],
					},
					{
						id: "T-002",
						title: "Second task",
						file: "tasks/t-002.md",
						status: "pending",
						dependencies: ["T-001"],
						requirements: [],
					},
				],
			},
			null,
			2,
		),
		"utf-8",
	);
	return rootPath;
}
