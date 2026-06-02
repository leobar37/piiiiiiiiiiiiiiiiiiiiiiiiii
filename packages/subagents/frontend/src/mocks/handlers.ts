import { http, HttpResponse } from "msw";
import {
	getAgentById,
	getEventsForInstance,
	getMessagesForInstance,
	getRunForInstance,
	MOCK_AGENTS,
	MOCK_LION_STATE,
	MOCK_PLAN_CHECKLIST,
} from "./data.ts";
import { createMockSseStream } from "./sse-emitter.ts";

export const handlers = [
	// GET /api/lion/state
	http.get("/api/lion/state", ({ request }) => {
		const url = new URL(request.url);
		const mode = url.searchParams.get("mode");
		if (mode === "simple") {
			return HttpResponse.json({
				...MOCK_LION_STATE,
				strategy: "simple",
				phase: "building",
				activePlanPath: null,
				activePlanSlug: null,
				planKind: null,
				activeTaskId: null,
			});
		}
		return HttpResponse.json(MOCK_LION_STATE);
	}),

	// GET /api/lion/checklist
	http.get("/api/lion/checklist", ({ request }) => {
		const url = new URL(request.url);
		const kind = url.searchParams.get("kind");
		const reference = url.searchParams.get("reference");

		if (kind === "plan" && (!reference || reference === MOCK_PLAN_CHECKLIST.rootPath)) {
			return HttpResponse.json(MOCK_PLAN_CHECKLIST);
		}

		return new HttpResponse("Checklist not found", { status: 404 });
	}),

	// GET /api/threads
	http.get("/api/threads", () => {
		return HttpResponse.json(MOCK_AGENTS);
	}),

	// GET /api/threads/:id
	http.get("/api/threads/:id", ({ params }) => {
		const agent = getAgentById(params.id as string);
		if (!agent) {
			return new HttpResponse("Not Found", { status: 404 });
		}
		return HttpResponse.json(agent);
	}),

	// GET /api/threads/:id/events
	http.get("/api/threads/:id/events", ({ params }) => {
		const events = getEventsForInstance(params.id as string);
		return HttpResponse.json(events);
	}),

	// GET /api/threads/:id/messages
	http.get("/api/threads/:id/messages", ({ params }) => {
		const messages = getMessagesForInstance(params.id as string);
		return HttpResponse.json(messages);
	}),

	// GET /api/threads/:id/run
	http.get("/api/threads/:id/run", ({ params }) => {
		const run = getRunForInstance(params.id as string);
		if (!run) {
			return new HttpResponse("Run record not found", { status: 404 });
		}
		return HttpResponse.json(run);
	}),

	// GET /api/instances
	http.get("/api/instances", () => {
		return HttpResponse.json(MOCK_AGENTS);
	}),

	// GET /api/instances/:id
	http.get("/api/instances/:id", ({ params }) => {
		const agent = getAgentById(params.id as string);
		if (!agent) {
			return new HttpResponse("Not Found", { status: 404 });
		}
		return HttpResponse.json(agent);
	}),

	// GET /api/instances/:id/events
	http.get("/api/instances/:id/events", ({ params }) => {
		const events = getEventsForInstance(params.id as string);
		return HttpResponse.json(events);
	}),

	// GET /api/instances/:id/messages
	http.get("/api/instances/:id/messages", ({ params }) => {
		const messages = getMessagesForInstance(params.id as string);
		return HttpResponse.json(messages);
	}),

	// GET /api/instances/:id/run
	http.get("/api/instances/:id/run", ({ params }) => {
		const run = getRunForInstance(params.id as string);
		if (!run) {
			return new HttpResponse("Run record not found", { status: 404 });
		}
		return HttpResponse.json(run);
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
