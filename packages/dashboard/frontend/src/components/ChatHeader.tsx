/**
 * ChatHeader — conversation title, status, and session controls.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession, useSessionStreaming } from "../store/index.js";
import { ModelSelector } from "./ModelSelector.js";

interface ChatHeaderProps {
	sessionId: string;
}

function StatusDot({ status, streaming }: { status: string; streaming: boolean }) {
	if (streaming) {
		return <span className="w-2 h-2 rounded-full bg-success animate-pulse" />;
	}
	switch (status) {
		case "idle":
			return <span className="w-2 h-2 rounded-full bg-success" />;
		case "streaming":
			return <span className="w-2 h-2 rounded-full bg-success animate-pulse" />;
		case "error":
			return <span className="w-2 h-2 rounded-full bg-error" />;
		case "stopped":
			return <span className="w-2 h-2 rounded-full bg-text-muted" />;
		default:
			return <span className="w-2 h-2 rounded-full bg-warning" />;
	}
}

function StatusLabel({ status, streaming }: { status: string; streaming: boolean }) {
	if (streaming) return <span className="text-success text-xs">Streaming</span>;
	switch (status) {
		case "idle":
			return <span className="text-text-secondary text-xs">Idle</span>;
		case "streaming":
			return <span className="text-success text-xs">Streaming</span>;
		case "error":
			return <span className="text-error text-xs">Error</span>;
		case "stopped":
			return <span className="text-text-muted text-xs">Stopped</span>;
		default:
			return <span className="text-text-secondary text-xs">{status}</span>;
	}
}

export function ChatHeader({ sessionId }: ChatHeaderProps) {
	const session = useSession(sessionId);
	const streaming = useSessionStreaming(sessionId);
	const [isEditing, setIsEditing] = useState(false);
	const [title, setTitle] = useState(session?.info.name || "New chat");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setTitle(session?.info.name || "New chat");
	}, [session?.info.name]);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const handleTitleSubmit = useCallback(() => {
		setIsEditing(false);
		// TODO: persist title change to backend when API supports it
	}, []);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				handleTitleSubmit();
			} else if (e.key === "Escape") {
				setIsEditing(false);
				setTitle(session?.info.name || "New chat");
			}
		},
		[handleTitleSubmit, session?.info.name],
	);

	const hasQueue = streaming.pendingSteering.length > 0 || streaming.pendingFollowUp.length > 0;
	const queueCount = streaming.pendingSteering.length + streaming.pendingFollowUp.length;

	if (!session) return null;

	return (
		<div className="flex items-center justify-between px-4 py-3.5 shrink-0 bg-bg-base/80 backdrop-blur-sm border-b border-border-subtle h-14">
			{/* Left: title + status */}
			<div className="flex items-center gap-3 min-w-0 flex-1">
				{isEditing ? (
					<input
						ref={inputRef}
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onBlur={handleTitleSubmit}
						onKeyDown={handleKeyDown}
						className="text-sm font-medium text-text-primary bg-transparent border-b border-border-default px-0 py-1 focus:border-accent focus:outline-none min-w-0"
					/>
				) : (
					<button
						onClick={() => setIsEditing(true)}
						className="text-sm font-medium text-text-primary hover:text-text-secondary transition-colors truncate"
						title="Click to edit"
					>
						{title}
					</button>
				)}

				<div className="flex items-center gap-1.5 shrink-0">
					<StatusDot status={session.info.status} streaming={session.streaming} />
					<StatusLabel status={session.info.status} streaming={session.streaming} />
				</div>

				{/* Subtle state indicators */}
				{streaming.isCompacting && (
					<span className="text-xs text-warning flex items-center gap-1">
						<span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
						Compacting
					</span>
				)}
				{streaming.isRetrying && streaming.retryInfo && (
					<span className="text-xs text-warning flex items-center gap-1">
						<span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
						{streaming.retryInfo}
					</span>
				)}
				{hasQueue && (
					<span className="text-xs text-text-muted flex items-center gap-1">
						<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								strokeLinecap="round"
								strokeWidth={2}
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						{queueCount} queued
					</span>
				)}
			</div>

			{/* Right: model selector */}
			<div className="flex items-center gap-2 shrink-0">
				<ModelSelector sessionId={sessionId} />
			</div>
		</div>
	);
}
