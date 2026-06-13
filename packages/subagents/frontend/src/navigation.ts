import { router } from "./router.tsx";

export function navigateToThread(id: string | null): void {
	if (id) {
		void router.navigate({ to: "/thread/$threadId", params: { threadId: id } });
	} else {
		void router.navigate({ to: "/" });
	}
}
