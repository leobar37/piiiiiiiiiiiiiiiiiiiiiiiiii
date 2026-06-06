import { describe, it, vi } from "vitest";

describe("vi check", () => {
	it("logs vi keys", () => {
		console.log("vi keys:", Object.keys(vi).sort().join(", "));
	});
});
