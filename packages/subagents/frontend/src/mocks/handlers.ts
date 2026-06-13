import { http, HttpResponse } from "msw";
import {
	getAgentById,
	appendMockPromptMessage,
	getEventsForInstance,
	getMessagesForInstance,
	getRunForInstance,
	MOCK_AGENTS,
	MOCK_LION_STATE,
	MOCK_MODELS,
	MOCK_PLAN_CHECKLIST,
	updateMockAgentModel,
} from "./data.ts";
import { createMockSseStream } from "./sse-emitter.ts";

function orpcJson(data: unknown): ReturnType<typeof HttpResponse.json> {
	return HttpResponse.json({ json: data });
}

function isORPCPath(url: URL, segments: string[]): boolean {
	const path = url.pathname.replace("/rpc/", "").split("/");
	return path.length === segments.length && path.every((s, i) => s === segments[i]);
}

async function getORPCInput(request: Request, url: URL): Promise<unknown> {
	if (request.method === "GET") {
		const data = url.searchParams.get("data");
		return data ? JSON.parse(data) : undefined;
	}
	try {
		const body = (await request.json()) as { json?: unknown };
		return body.json;
	} catch {
		return undefined;
	}
}

export const handlers = [
	http.all("/rpc/*", async ({ request }) => {
		const url = new URL(request.url);

		// GET /rpc/lion/state (no input)
		if (isORPCPath(url, ["lion", "state"])) {
			const mode = url.searchParams.get("mode");
			if (mode === "simple") {
				return orpcJson({
					...MOCK_LION_STATE,
					strategy: "simple",
					phase: "building",
					activePlanPath: null,
					activePlanSlug: null,
					planKind: null,
					activeTaskId: null,
				});
			}
			if (mode === "none") {
				return orpcJson({
					...MOCK_LION_STATE,
					active: false,
					strategy: "none",
					phase: "planning",
					activePlanPath: null,
					activePlanSlug: null,
					planKind: null,
					activeTaskId: null,
					lastRunId: null,
				});
			}
			return orpcJson(MOCK_LION_STATE);
		}

		// POST /rpc/lion/checklist
		if (isORPCPath(url, ["lion", "checklist"])) {
			const input = (await getORPCInput(request, url)) as { kind: string; reference?: string } | undefined;
			const kind = input?.kind;
			const reference = input?.reference;
			if (kind === "plan" && (!reference || reference === MOCK_PLAN_CHECKLIST.rootPath)) {
				return orpcJson(MOCK_PLAN_CHECKLIST);
			}
			return new HttpResponse("Checklist not found", { status: 404 });
		}

		// POST /rpc/threads/list
		if (isORPCPath(url, ["threads", "list"])) {
			return orpcJson(MOCK_AGENTS);
		}

		// POST /rpc/threads/get
		if (isORPCPath(url, ["threads", "get"])) {
			const input = (await getORPCInput(request, url)) as { threadId: string } | undefined;
			const agent = getAgentById(input?.threadId ?? "");
			if (!agent) {
				return new HttpResponse("Not Found", { status: 404 });
			}
			return orpcJson(agent);
		}

		// POST /rpc/threads/session
		if (isORPCPath(url, ["threads", "session"])) {
			const input = (await getORPCInput(request, url)) as { threadId: string } | undefined;
			const messages = getMessagesForInstance(input?.threadId ?? "");
			return orpcJson({
				sessionId: `mock-session-${input?.threadId ?? ""}`,
				messages,
			});
		}

		// POST /rpc/threads/messages
		if (isORPCPath(url, ["threads", "messages"])) {
			const input = (await getORPCInput(request, url)) as { threadId: string } | undefined;
			const messages = getMessagesForInstance(input?.threadId ?? "");
			return orpcJson(messages);
		}

		// POST /rpc/threads/events
		if (isORPCPath(url, ["threads", "events"])) {
			const input = (await getORPCInput(request, url)) as { threadId: string } | undefined;
			const events = getEventsForInstance(input?.threadId ?? "");
			return orpcJson(events);
		}

		// POST /rpc/threads/run
		if (isORPCPath(url, ["threads", "run"])) {
			const input = (await getORPCInput(request, url)) as { threadId: string } | undefined;
			const run = getRunForInstance(input?.threadId ?? "");
			if (!run) {
				return new HttpResponse("Run record not found", { status: 404 });
			}
			return orpcJson(run);
		}

		// POST /rpc/threads/prompt
		if (isORPCPath(url, ["threads", "prompt"])) {
			const input = (await getORPCInput(request, url)) as
				| { threadId: string; message: string; mode: "prompt" | "follow_up" | "steer" }
				| undefined;
				if (!input?.threadId || !input.message.trim()) {
					return new HttpResponse("Invalid prompt", { status: 400 });
				}
				appendMockPromptMessage(input.threadId, input.message.trim());
				return orpcJson({
					threadId: input.threadId,
				mode: input.mode,
				status: "sent",
				acceptedAt: Date.now(),
			});
		}

		// POST /rpc/threads/commands
		if (isORPCPath(url, ["threads", "commands"])) {
			return orpcJson([
				{ name: "lion-build", description: "Activate Lion build/execution mode", source: "extension" },
				{ name: "lion-validate", description: "Ask the orchestrator to validate the active Lion plan", source: "extension" },
				{ name: "skill:planner", description: "Create technical implementation plans", source: "skill" },
			]);
		}

		// POST /rpc/threads/models
		if (isORPCPath(url, ["threads", "models"])) {
			return orpcJson(MOCK_MODELS);
		}

		// POST /rpc/threads/model
		if (isORPCPath(url, ["threads", "model"])) {
			const input = (await getORPCInput(request, url)) as
				| { threadId: string; provider: string; modelId: string }
				| undefined;
			if (!input?.threadId || !input.provider || !input.modelId) {
				return new HttpResponse("Invalid model selection", { status: 400 });
			}
			const model = MOCK_MODELS.find((candidate) => candidate.provider === input.provider && candidate.id === input.modelId);
			if (!model) {
				return new HttpResponse("Model not found", { status: 404 });
			}
			updateMockAgentModel(input.threadId, input.provider, input.modelId);
			return orpcJson({
				threadId: input.threadId,
				provider: input.provider,
				modelId: input.modelId,
				status: "selected",
				selectedAt: Date.now(),
			});
		}

		return new HttpResponse("Not Found", { status: 404 });
	}),

	// GET /events (SSE)
	http.get("/events", ({ request }) => {
		const url = new URL(request.url);
		const instanceId = url.searchParams.get("instanceId") ?? undefined;

		const stream = createMockSseStream(instanceId);

		return new HttpResponse(stream as unknown as BodyInit, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	}),
];
