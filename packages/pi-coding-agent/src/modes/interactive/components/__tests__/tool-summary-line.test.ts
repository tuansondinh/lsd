import { describe, it } from "node:test";
import assert from "node:assert/strict";
import stripAnsi from "strip-ansi";

import { ToolSummaryLine } from "../tool-summary-line.js";
import { initTheme } from "../../theme/theme.js";

initTheme("dark");

describe("ToolSummaryLine", () => {
	it("aggregates repeated tools with tool-row style formatting", () => {
		const summary = new ToolSummaryLine();
		summary.addTool("read", 600);
		summary.addTool("lsp", 250);
		summary.addTool("read", 150);

		const rendered = stripAnsi(summary.render(160).join("\n"));
		assert.match(rendered, /^ ● collapsed tools /);
		assert.ok(rendered.includes("read ×2 · lsp · 1.0s"));
		assert.equal(rendered.includes("⎯"), false);
	});

	it("renders nothing when empty or hidden", () => {
		const summary = new ToolSummaryLine();
		assert.deepEqual(summary.render(80), []);

		summary.addTool("grep", 100);
		summary.setHidden(true);
		assert.deepEqual(summary.render(80), []);
	});
});
