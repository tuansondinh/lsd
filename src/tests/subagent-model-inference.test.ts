import assert from "node:assert/strict";
import test from "node:test";

import { resolveSubagentModel } from "../resources/extensions/subagent/model-resolution.ts";

test("resolveSubagentModel prefers explicit tool-call override", () => {
	const result = resolveSubagentModel(
		{ name: "worker", model: "anthropic/claude-sonnet-4-6" },
		{
			overrideModel: "openai/gpt-5.4",
			parentModel: { provider: "google", id: "gemini-2.5-pro" },
		},
	);

	assert.equal(result, "openai/gpt-5.4");
});

test("resolveSubagentModel falls back to agent frontmatter model", () => {
	const result = resolveSubagentModel(
		{ name: "worker", model: "anthropic/claude-sonnet-4-6" },
		{ parentModel: { provider: "google", id: "gemini-2.5-pro" } },
	);

	assert.equal(result, "anthropic/claude-sonnet-4-6");
});

test("resolveSubagentModel falls back to parent session model", () => {
	const result = resolveSubagentModel(
		{ name: "worker", model: undefined },
		{ parentModel: { provider: "google", id: "gemini-2.5-pro" } },
	);

	assert.equal(result, "google/gemini-2.5-pro");
});

test("resolveSubagentModel returns undefined when nothing can be inferred", () => {
	const result = resolveSubagentModel({ name: "worker", model: undefined });

	assert.equal(result, undefined);
});
