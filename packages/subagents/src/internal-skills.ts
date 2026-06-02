import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkills, type ResourceDiagnostic, type Skill } from "@earendil-works/pi-coding-agent";

export const INTERNAL_SKILL_NAMES = ["planner", "subagent-delegation", "code-review"] as const;

export type InternalSkillName = (typeof INTERNAL_SKILL_NAMES)[number];

type SkillsResult = {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
};

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function getPackageRoot(): string {
	const distSkillsDir = join(MODULE_DIR, "skills");
	if (existsSync(distSkillsDir)) return MODULE_DIR;
	return join(MODULE_DIR, "..");
}

export function getInternalSkillPath(name: InternalSkillName): string {
	return join(getPackageRoot(), "skills", name);
}

export function getInternalSkillPaths(names: readonly InternalSkillName[] = INTERNAL_SKILL_NAMES): string[] {
	return names.map((name) => getInternalSkillPath(name));
}

export function applyInternalSkillPrecedence(options: {
	base: SkillsResult;
	cwd: string;
	agentDir: string;
	skillPaths?: readonly string[];
}): SkillsResult {
	const internal = loadSkills({
		cwd: options.cwd,
		agentDir: options.agentDir,
		skillPaths: [...(options.skillPaths ?? getInternalSkillPaths())],
		includeDefaults: false,
	});

	if (internal.skills.length === 0) {
		return {
			skills: options.base.skills,
			diagnostics: [...options.base.diagnostics, ...internal.diagnostics],
		};
	}

	const internalByName = new Map(internal.skills.map((skill) => [skill.name, skill]));
	const internalFilePaths = new Set(internal.skills.map((skill) => skill.filePath));
	const retainedBaseSkills = options.base.skills.filter((skill) => !internalByName.has(skill.name));
	const baseDiagnostics = options.base.diagnostics.filter((diagnostic) => {
		if (diagnostic.type !== "collision" || diagnostic.collision?.resourceType !== "skill") return true;
		return (
			!internalFilePaths.has(diagnostic.collision.winnerPath) &&
			!internalFilePaths.has(diagnostic.collision.loserPath)
		);
	});
	const collisionDiagnostics = options.base.skills
		.filter((skill) => internalByName.has(skill.name) && !internalFilePaths.has(skill.filePath))
		.map((skill): ResourceDiagnostic => {
			const winner = internalByName.get(skill.name)!;
			return {
				type: "collision",
				message: `name "${skill.name}" collision`,
				path: skill.filePath,
				collision: {
					resourceType: "skill",
					name: skill.name,
					winnerPath: winner.filePath,
					loserPath: skill.filePath,
				},
			};
		});

	return {
		skills: [...internal.skills, ...retainedBaseSkills],
		diagnostics: [...baseDiagnostics, ...internal.diagnostics, ...collisionDiagnostics],
	};
}
