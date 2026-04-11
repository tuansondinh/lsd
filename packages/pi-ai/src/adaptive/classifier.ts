import { completeSimple } from "../stream.js";
import type { Message, Model } from "../types.js";

export const ADAPTIVE_SCORE_BANDS = {
	lowMax: 20,
	mediumMax: 70,
} as const;

export interface AdaptiveClassifierInput {
	latestUserMessage: Message;
	priorMessages?: Message[];
	toolNames?: string[];
	planModeActive?: boolean;
}

export interface AdaptiveClassifierResult {
	level: "low" | "medium" | "high";
	reasons: string[];
	score: number;
}

function getUserText(message: Message): string {
	if (message.role !== "user") {
		throw new Error("Adaptive classifier requires a user message");
	}
	if (typeof message.content === "string") {
		return message.content.trim();
	}
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join(" ")
		.trim();
}

const LLM_CLASSIFIER_SYSTEM = `You are a reasoning-effort classifier for a coding assistant.

Given the user's message, decide how much thinking effort the assistant should use:
- low: trivial tasks — short acknowledgements, tiny edits, simple lookups
- medium: moderate tasks — single-file changes, explanations, focused debugging
- high: complex tasks — multi-file refactors, architecture decisions, hard bugs

Reply with exactly one word: low, medium, or high.`;

export interface LLMClassifierInput extends AdaptiveClassifierInput {
	/** The model to use for classification */
	classifierModel: Model<any>;
	/** AbortSignal to cancel the request */
	signal?: AbortSignal;
}

/**
 * Adaptive thinking classifier using only an LLM decision.
 *
 * If the classifier call fails or returns invalid output, defaults to medium.
 */
export async function classifyAdaptiveThinkingWithLLM(
	input: LLMClassifierInput,
): Promise<AdaptiveClassifierResult> {
	const text = getUserText(input.latestUserMessage);
	if (!text) {
		throw new Error("Adaptive classifier requires non-empty user text");
	}

	const priorContext = (input.priorMessages ?? [])
		.slice(-4)
		.map((m) => {
			const role = m.role === "user" ? "User" : "Assistant";
			const content = typeof m.content === "string" ? m.content : m.content.map((b) => ("text" in b ? b.text : "")).join(" ");
			return `${role}: ${content.slice(0, 300)}`;
		})
		.join("\n");

	const userPrompt = priorContext
		? `Prior context:\n${priorContext}\n\nCurrent message:\n${text}`
		: text;

	try {
		const result = await completeSimple(
			input.classifierModel,
			{
				systemPrompt: LLM_CLASSIFIER_SYSTEM,
				messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }],
			},
			{ signal: input.signal },
		);

		const raw = result.content
			.filter((b) => b.type === "text")
			.map((b) => b.text)
			.join("")
			.trim()
			.toLowerCase();

		if (raw === "low" || raw === "medium" || raw === "high") {
			return {
				level: raw,
				reasons: ["llm_classified"],
				score: raw === "low" ? 10 : raw === "medium" ? 55 : 85,
			};
		}

		return { level: "medium", reasons: ["llm_invalid_output_default_medium"], score: 55 };
	} catch {
		return { level: "medium", reasons: ["llm_error_default_medium"], score: 55 };
	}
}
