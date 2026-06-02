import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyntheticSourceInfo, type Skill } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
	applyInternalSkillPrecedence,
	getInternalSkillPath,
	getInternalSkillPaths,
	INTERNAL_SKILL_NAMES,
} from "../src/internal-skills.js";

function createSkill(options: { name: string; description: string; filePath: string; baseDir: string }): Skill {
	return {
		name: options.name,
		description: options.description,
		filePath: options.filePath,
		baseDir: options.baseDir,
		sourceInfo: createSyntheticSourceInfo(options.filePath, { source: "test" }),
		disableModelInvocation: false,
	};
}

describe("internal skills", () => {
	it("resolves bundled internal skill paths", () => {
		expect(INTERNAL_SKILL_NAMES).toEqual(["planner", "subagent-delegation", "code-review"]);
		for (const path of getInternalSkillPaths()) {
			expect(path).toContain("packages/subagents/skills");
		}
		expect(getInternalSkillPath("planner")).toContain("skills/planner");
		expect(getInternalSkillPath("subagent-delegation")).toContain("skills/subagent-delegation");
		expect(getInternalSkillPath("code-review")).toContain("skills/code-review");
	});

	it("loads all bundled internal skills with precedence helper", () => {
		const result = applyInternalSkillPrecedence({
			base: { skills: [], diagnostics: [] },
			cwd: process.cwd(),
			agentDir: process.cwd(),
		});

		expect(result.skills.map((skill) => skill.name).sort()).toEqual([
			"code-review",
			"planner",
			"subagent-delegation",
		]);
	});

	it("prefers internal skills over base skills with the same name", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "subagents-internal-skills-"));
		const agentDir = join(tempDir, "agent");
		const cwd = join(tempDir, "project");
		const plannerDir = join(tempDir, "skills", "planner");
		const plannerPath = join(plannerDir, "SKILL.md");

		try {
			mkdirSync(plannerDir, { recursive: true });
			writeFileSync(
				plannerPath,
				`---
name: planner
description: Internal planner test skill.
---
Internal planner body.
`,
			);

			const basePlanner = createSkill({
				name: "planner",
				description: "Project planner",
				filePath: join(cwd, ".pi", "skills", "planner", "SKILL.md"),
				baseDir: join(cwd, ".pi", "skills", "planner"),
			});
			const unrelated = createSkill({
				name: "unrelated",
				description: "Unrelated",
				filePath: join(cwd, ".pi", "skills", "unrelated", "SKILL.md"),
				baseDir: join(cwd, ".pi", "skills", "unrelated"),
			});

			const result = applyInternalSkillPrecedence({
				base: { skills: [basePlanner, unrelated], diagnostics: [] },
				cwd,
				agentDir,
				skillPaths: [plannerDir],
			});

			expect(result.skills.map((skill) => skill.name)).toEqual(["planner", "unrelated"]);
			expect(result.skills[0].filePath).toBe(plannerPath);
			expect(result.diagnostics.some((diagnostic) => diagnostic.type === "collision")).toBe(true);
			expect(
				result.diagnostics.some(
					(diagnostic) =>
						diagnostic.type === "collision" &&
						diagnostic.collision?.winnerPath === diagnostic.collision?.loserPath,
				),
			).toBe(false);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
