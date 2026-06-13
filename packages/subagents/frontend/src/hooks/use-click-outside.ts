import { useEffect } from "react";

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
	useEffect(() => {
		function handleMouseDown(event: MouseEvent) {
			const target = event.target as Node;
			if (!ref.current || ref.current.contains(target)) return;
			handler();
		}

		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [ref, handler]);
}
