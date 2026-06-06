export function hasPlanReference(prompt: string): boolean {
	const hasXmlPlanReference = /<plan\s/.test(prompt) && /<task\s/.test(prompt);
	const hasStructuredPlanReference =
		/\bplan\s+(path|slug)\s*[:=]/i.test(prompt) && /\btask\s+(id|file)\s*[:=]/i.test(prompt);
	return hasXmlPlanReference || hasStructuredPlanReference;
}

export function inferPlanTaskId(...values: string[]): string | null {
	for (const value of values) {
		const match = /\bT-\d{3,}\b/.exec(value);
		if (match) return match[0];
	}
	return null;
}

export function joinPlanPath(rootPath: string, taskFile: string): string {
	if (taskFile.startsWith("/") || taskFile.startsWith(".")) return taskFile;
	return `${rootPath.replace(/\/$/, "")}/${taskFile}`;
}

export function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}
