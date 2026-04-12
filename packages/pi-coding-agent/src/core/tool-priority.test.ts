import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getToolPriority, shouldCollapse } from "./tool-priority.js";

describe("tool priority", () => {
	it("keeps edit and write always visible", () => {
		assert.equal(getToolPriority("edit"), "always");
		assert.equal(getToolPriority("write"), "always");
		assert.equal(shouldCollapse("edit", false), false);
		assert.equal(shouldCollapse("write", true), false);
	});

	it("collapses bash and bg_shell only on success", () => {
		assert.equal(getToolPriority("bash"), "on-error");
		assert.equal(getToolPriority("bg_shell"), "on-error");
		assert.equal(shouldCollapse("bash", false), true);
		assert.equal(shouldCollapse("bash", true), false);
		assert.equal(shouldCollapse("bg_shell", false), true);
		assert.equal(shouldCollapse("bg_shell", true), false);
	});

	it("collapses read, grep, and unknown tools", () => {
		assert.equal(getToolPriority("read"), "collapse");
		assert.equal(getToolPriority("grep"), "collapse");
		assert.equal(getToolPriority("unknown-tool"), "collapse");
		assert.equal(shouldCollapse("read", false), true);
		assert.equal(shouldCollapse("unknown-tool", true), true);
	});
});
