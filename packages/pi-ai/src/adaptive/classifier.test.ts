import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Message } from "../types.js";
import { ADAPTIVE_SCORE_BANDS, classifyAdaptiveThinkingWithLLM } from "./classifier.js";

function user(text: string): Message {
	return {
		role: "user",
		content: text,
		timestamp: Date.now(),
	};
}

describe("classifyAdaptiveThinkingWithLLM", () => {
	it("throws for empty user text", async () => {
		await assert.rejects(
			() => classifyAdaptiveThinkingWithLLM({
				latestUserMessage: user("   "),
				classifierModel: {
					provider: "test",
					id: "fake",
					name: "fake",
					api: "openai-completions",
					maxTokens: 1000,
					reasoning: true,
				} as any,
			}),
			/non-empty user text/,
		);
	});

	it("exports stable score bands", () => {
		assert.deepEqual(ADAPTIVE_SCORE_BANDS, {
			lowMax: 20,
			mediumMax: 70,
		});
	});
});
