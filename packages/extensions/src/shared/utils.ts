/**
 * Shared utilities for extensions
 */

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatTokensCompact(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) {
		const scaled = value / 1_000_000;
		return `${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1)}M`;
	}
	if (abs >= 1_000) {
		const scaled = value / 1_000;
		return `${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1)}K`;
	}
	return String(value);
}

export function formatElapsedSeconds(totalSeconds: number): string {
	const seconds = Math.max(0, Math.floor(totalSeconds));
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainingSeconds = seconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
	return `${remainingSeconds}s`;
}

export function isTextPart(part: unknown): part is { type: "text"; text: string } {
	return Boolean(part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part);
}

export function extractTextFromContent(content: unknown): string {
	if (typeof content === "string") {
		return content.trim();
	}

	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.filter(isTextPart)
		.map((part) => part.text)
		.join("\n")
		.trim();
}
