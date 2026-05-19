import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function readArtifact(artifactsDir: string, path: string): string {
	const fullPath = join(artifactsDir, path);
	return readFileSync(fullPath, "utf-8");
}

export function readResultArtifact(artifactsDir: string, taskId: string): string | null {
	const path = join(artifactsDir, `${taskId}.result.md`);
	if (!existsSync(path)) return null;
	return readFileSync(path, "utf-8");
}

export function artifactExists(artifactsDir: string, path: string): boolean {
	return existsSync(join(artifactsDir, path));
}

export function listResultArtifacts(artifactsDir: string): string[] {
	if (!existsSync(artifactsDir)) return [];
	return readdirSync(artifactsDir).filter((f) => f.endsWith(".result.md"));
}
