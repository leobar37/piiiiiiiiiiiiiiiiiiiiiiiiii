import type { LionReviewVerdict } from "../types.js";

export function parseReviewVerdict(summary: string): LionReviewVerdict {
	const lines = summary
		.split(/\r?\n/)
		.map((line) => line.trim().toLowerCase())
		.filter(Boolean);
	if (lines.includes("lion_review_status: approved")) return "approved";
	if (lines.includes("lion_review_status: rejected")) return "rejected";
	return "unknown";
}
