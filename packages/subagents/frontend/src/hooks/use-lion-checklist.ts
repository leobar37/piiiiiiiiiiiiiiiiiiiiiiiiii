import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.ts";
import type { LionChecklistKind } from "../types.ts";

interface LionChecklistQueryOptions {
	enabled?: boolean;
	refetchInterval?: number | false;
}

export function useLionChecklist(kind: LionChecklistKind, reference?: string, options: LionChecklistQueryOptions = {}) {
	return useQuery({
		...api.lion.checklist.queryOptions({
			input: { kind, reference },
		}),
		...options,
	});
}
