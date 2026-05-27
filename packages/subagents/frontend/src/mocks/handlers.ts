import { http, HttpResponse } from "msw";
import { getAgentById, getEventsForInstance, getMessagesForInstance, MOCK_AGENTS } from "./data.ts";
import { createMockSseStream } from "./sse-emitter.ts";

export const handlers = [
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
