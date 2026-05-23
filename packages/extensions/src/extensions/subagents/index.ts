import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Subagents extension is temporarily disabled.
// The lion extension already provides structured sub-agent delegation
// (executor, reviewer, validator) with plan-based orchestration.
// Keeping both would create overlapping tools and confuse the agent.
// Re-enable here if you want ad-hoc subagent delegation separate from lion.
export default function subagentsExtension(_pi: ExtensionAPI): void {
	// no-op
}
