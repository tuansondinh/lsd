/**
 * RetryHandler tests — long-context entitlement 429 error handling (#2803)
 *
 * Verifies that "Extra usage is required for long context requests" errors
 * are classified as quota_exhausted (not rate_limit) and trigger a model
 * downgrade from [1m] to base when no cross-provider fallback exists.
 */

import { describe, it, beforeEach, mock, type Mock } from "node:test";
import assert from "node:assert/strict";
import { RetryHandler, type RetryHandlerDeps } from "./retry-handler.js";
import type { Api, AssistantMessage, Model } from "@gsd/pi-ai";
import type { FallbackResolver } from "./fallback-resolver.js";
import type { ModelRegistry } from "./model-registry.js";
import type { SettingsManager } from "./settings-manager.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockModel(provider: string, id: string): Model<Api> {
	return {
		id,
		name: id,
		api: "anthropic" as Api,
		provider,
		baseUrl: "https://api.anthropic.com",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1_000_000,
		maxTokens: 16384,
	} as Model<Api>;
}

function errorMessage(msg: string): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-opus-4-6[1m]",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "error",
		errorMessage: msg,
		timestamp: Date.now(),
	} as AssistantMessage;
}

interface MockDeps {
	deps: RetryHandlerDeps;
	emittedEvents: Array<Record<string, any>>;
	continueFn: Mock<() => Promise<void>>;
	onModelChangeFn: Mock<(model: Model<any>) => void>;
	markUsageLimitReached: Mock<(...args: any[]) => boolean>;
	findFallback: Mock<(...args: any[]) => Promise<any>>;
	findModel: Mock<(provider: string, modelId: string) => Model<Api> | undefined>;
}

function createMockDeps(overrides?: {
	model?: Model<Api>;
	retryEnabled?: boolean;
	markUsageLimitReachedResult?: boolean;
	fallbackResult?: any;
	findModelResult?: (provider: string, modelId: string) => Model<Api> | undefined;
}): MockDeps {
	const model = overrides?.model ?? createMockModel("anthropic", "claude-opus-4-6[1m]");
	const emittedEvents: Array<Record<string, any>> = [];
	const continueFn = mock.fn(async () => {});
	const onModelChangeFn = mock.fn((_model: Model<any>) => {});
	const markUsageLimitReached = mock.fn(
		() => overrides?.markUsageLimitReachedResult ?? false,
	);
	const findFallback = mock.fn(async () => overrides?.fallbackResult ?? null);
	const findModel = mock.fn(
		overrides?.findModelResult ?? ((_provider: string, _modelId: string) => undefined),
	);

	const messages: Array<{ role: string } & Record<string, any>> = [];

	const deps: RetryHandlerDeps = {
		agent: {
			continue: continueFn,
			state: { messages },
			setModel: mock.fn(),
			replaceMessages: mock.fn((newMessages: any[]) => {
				messages.length = 0;
				messages.push(...newMessages);
			}),
		} as any,
		settingsManager: {
			getRetryEnabled: () => overrides?.retryEnabled ?? true,
			getRetrySettings: () => ({
				enabled: overrides?.retryEnabled ?? true,
				maxRetries: 5,
				baseDelayMs: 1000,
				maxDelayMs: 30000,
			}),
		} as unknown as SettingsManager,
		modelRegistry: {
			authStorage: {
				markUsageLimitReached,
			},
			find: findModel,
		} as unknown as ModelRegistry,
		fallbackResolver: {
			findFallback,
		} as unknown as FallbackResolver,
		getModel: () => model,
		getSessionId: () => "test-session",
		emit: (event: any) => emittedEvents.push(event),
		onModelChange: onModelChangeFn,
	};

	return { deps, emittedEvents, continueFn, onModelChangeFn, markUsageLimitReached, findFallback, findModel };
}

// ─── _classifyErrorType (tested via handleRetryableError behavior) ──────────

describe("RetryHandler — long-context entitlement 429 (#2803)", () => {

	describe("error classification", () => {
		it("classifies 'Extra usage is required for long context requests' as quota_exhausted, not rate_limit", async () => {
			// When the error is classified as quota_exhausted AND no alternate credentials
			// AND no fallback, the handler should emit fallback_chain_exhausted and stop.
			// If misclassified as rate_limit, it would enter the backoff loop instead.
			const { deps, emittedEvents, findModel } = createMockDeps({
				model: createMockModel("anthropic", "claude-opus-4-6[1m]"),
				markUsageLimitReachedResult: false, // no alternate credentials
				fallbackResult: null, // no cross-provider fallback
				findModelResult: () => undefined, // no base model either
			});

			const handler = new RetryHandler(deps);
			const msg = errorMessage(
				'429 {"type":"error","error":{"type":"rate_limit_error","message":"Extra usage is required for long context requests."}}'
			);

			const result = await handler.handleRetryableError(msg);

			// Should NOT retry (would be true if misclassified as rate_limit entering backoff)
			assert.equal(result, false);

			// Should emit fallback_chain_exhausted (quota_exhausted path), NOT auto_retry_start (backoff path)
			const chainExhausted = emittedEvents.find((e) => e.type === "fallback_chain_exhausted");
			assert.ok(chainExhausted, "Expected fallback_chain_exhausted event for entitlement error");

			const retryStart = emittedEvents.find((e) => e.type === "auto_retry_start");
			assert.equal(retryStart, undefined, "Should NOT emit auto_retry_start for entitlement error");
		});

		it("still classifies regular 429 rate limits as rate_limit", async () => {
			// A normal "rate limit" 429 should still be classified as rate_limit
			const { deps, emittedEvents } = createMockDeps({
				model: createMockModel("anthropic", "claude-opus-4-6"),
				markUsageLimitReachedResult: false,
				fallbackResult: null,
			});

			const handler = new RetryHandler(deps);
			const msg = errorMessage("429 Too Many Requests");

			const result = await handler.handleRetryableError(msg);

			// Should enter the backoff loop (rate_limit path, not quota_exhausted)
			assert.equal(result, true);

			const retryStart = emittedEvents.find((e) => e.type === "auto_retry_start");
			assert.ok(retryStart, "Regular 429 should enter backoff retry");
		});
	});

	describe("long-context model downgrade", () => {
		it("downgrades from [1m] to base model when entitlement error and no fallback", async () => {
			const baseModel = createMockModel("anthropic", "claude-opus-4-6");
			const { deps, emittedEvents, onModelChangeFn, continueFn } = createMockDeps({
				model: createMockModel("anthropic", "claude-opus-4-6[1m]"),
				markUsageLimitReachedResult: false,
				fallbackResult: null,
				findModelResult: (provider: string, modelId: string) => {
					if (provider === "anthropic" && modelId === "claude-opus-4-6") return baseModel;
					return undefined;
				},
			});

			const handler = new RetryHandler(deps);
			const msg = errorMessage("Extra usage is required for long context requests.");

			const result = await handler.handleRetryableError(msg);

			assert.equal(result, true, "Should retry after downgrade");

			// Should have called setModel with the base model
			const setModelCalls = (deps.agent.setModel as any).mock.calls;
			assert.equal(setModelCalls.length, 1);
			assert.equal(setModelCalls[0].arguments[0].id, "claude-opus-4-6");

			// Should have notified about model change
			assert.equal(onModelChangeFn.mock.calls.length, 1);

			// Should emit a fallback_provider_switch event indicating downgrade
			const switchEvent = emittedEvents.find((e) => e.type === "fallback_provider_switch");
			assert.ok(switchEvent, "Expected fallback_provider_switch event for downgrade");
			assert.ok(switchEvent!.reason.includes("long context downgrade"), `reason should mention downgrade: ${switchEvent!.reason}`);
		});

		it("emits fallback_chain_exhausted when base model is also unavailable", async () => {
			const { deps, emittedEvents } = createMockDeps({
				model: createMockModel("anthropic", "claude-opus-4-6[1m]"),
				markUsageLimitReachedResult: false,
				fallbackResult: null,
				findModelResult: () => undefined, // base model not found
			});

			const handler = new RetryHandler(deps);
			const msg = errorMessage("Extra usage is required for long context requests.");

			const result = await handler.handleRetryableError(msg);

			assert.equal(result, false);
			const chainExhausted = emittedEvents.find((e) => e.type === "fallback_chain_exhausted");
			assert.ok(chainExhausted, "Expected fallback_chain_exhausted when base model unavailable");
		});

		it("does not attempt downgrade for non-[1m] models", async () => {
			// When a regular model (no [1m] suffix) gets a quota_exhausted error
			// with no fallback, it should just stop — no downgrade attempt.
			const { deps, emittedEvents } = createMockDeps({
				model: createMockModel("anthropic", "claude-opus-4-6"),
				markUsageLimitReachedResult: false,
				fallbackResult: null,
			});

			const handler = new RetryHandler(deps);
			const msg = errorMessage("Extra usage is required for long context requests.");

			const result = await handler.handleRetryableError(msg);

			assert.equal(result, false);
			const chainExhausted = emittedEvents.find((e) => e.type === "fallback_chain_exhausted");
			assert.ok(chainExhausted);

			// No downgrade switch should occur
			const switchEvent = emittedEvents.find((e) => e.type === "fallback_provider_switch");
			assert.equal(switchEvent, undefined, "Should not switch for non-[1m] models");
		});
	});

	describe("successful credential rotation completion", () => {
		it("resolves the pending retry after a successful credential-switch retry", async () => {
			const { deps, emittedEvents } = createMockDeps({
				model: createMockModel("openai", "gpt-5.4"),
				markUsageLimitReachedResult: true,
			});

			const handler = new RetryHandler(deps);
			const msg = errorMessage("You have hit your ChatGPT usage limit (team plan). Try again in ~128 min.");

			// Mirror real agent-session behavior: create the pending retry promise before handling agent_end.
			handler.createRetryPromiseForAgentEnd([msg]);

			const retried = await handler.handleRetryableError(msg);
			assert.equal(retried, true, "Expected credential rotation retry to start");

			let resolved = false;
			const waitPromise = handler.waitForRetry().then(() => {
				resolved = true;
			});

			// Success on the rotated credential should release the original prompt() waiter.
			handler.handleSuccessfulResponse();
			await waitPromise;

			assert.equal(resolved, true, "Pending retry promise should resolve after successful rotated response");
			assert.equal(handler.isRetrying, false, "Retry handler should no longer be retrying");

			const retryEnd = emittedEvents.find((e) => e.type === "auto_retry_end" && e.success === true);
			assert.ok(retryEnd, "Expected successful auto_retry_end event after rotated credential succeeds");
		});

		it("resolves the pending retry if retry continuation rejects", async () => {
			const continueError = new Error("Operation aborted");
			const { deps, emittedEvents, continueFn } = createMockDeps({
				model: createMockModel("openai", "gpt-5.4"),
				markUsageLimitReachedResult: true,
			});
			continueFn.mock.mockImplementation(async () => {
				throw continueError;
			});

			const handler = new RetryHandler(deps);
			const msg = errorMessage("You have hit your ChatGPT usage limit (team plan). Try again in ~124 min.");

			handler.createRetryPromiseForAgentEnd([msg]);
			const retried = await handler.handleRetryableError(msg);
			assert.equal(retried, true, "Expected credential rotation retry to start");

			await new Promise((resolve) => setTimeout(resolve, 0));
			await handler.waitForRetry();

			assert.equal(handler.isRetrying, false, "Retry handler should recover from rejected continue()");
			const retryEnd = emittedEvents.find((e) => e.type === "auto_retry_end" && e.success === false);
			assert.ok(retryEnd, "Expected failed auto_retry_end event when continue() rejects");
			assert.match(String(retryEnd?.finalError ?? ""), /Operation aborted/);
		});
	});

	describe("isRetryableError", () => {
		it("considers long-context entitlement error as retryable", () => {
			const { deps } = createMockDeps();
			const handler = new RetryHandler(deps);
			const msg = errorMessage("Extra usage is required for long context requests.");
			assert.equal(handler.isRetryableError(msg), true);
		});

		it("considers ChatGPT usage limit errors as retryable", () => {
			const { deps } = createMockDeps();
			const handler = new RetryHandler(deps);
			const msg = errorMessage("You have hit your ChatGPT usage limit (team plan). Try again in ~144 min.");
			assert.equal(handler.isRetryableError(msg), true);
		});

		it("considers auth/token errors as retryable credential failures", () => {
			const { deps } = createMockDeps();
			const handler = new RetryHandler(deps);
			assert.equal(handler.isRetryableError(errorMessage("401 Unauthorized")), true);
			assert.equal(handler.isRetryableError(errorMessage("invalid_token")), true);
		});
	});
});
