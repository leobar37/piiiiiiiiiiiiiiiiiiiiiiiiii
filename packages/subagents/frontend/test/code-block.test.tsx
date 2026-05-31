import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CodeBlock } from "../src/components/blocks/CodeBlock.js";

describe("CodeBlock", () => {
	it("renders unknown languages without throwing", () => {
		expect(() => {
			renderToString(<CodeBlock code={"SELECT * FROM organizations;"} language="sql" />);
		}).not.toThrow();
	});

	it("renders registered languages without throwing", () => {
		expect(() => {
			renderToString(<CodeBlock code={"const ok = true;"} language="ts" />);
		}).not.toThrow();
	});
});
