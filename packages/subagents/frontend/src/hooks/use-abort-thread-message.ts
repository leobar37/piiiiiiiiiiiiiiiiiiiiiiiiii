import { useMutation } from "@tanstack/react-query";
import { orpc } from "../api/client.ts";

export function useAbortThreadMessage() {
	return useMutation({
		mutationFn: (input: { threadId: string }) =>
			orpc.threads.abort(input),
	});
}