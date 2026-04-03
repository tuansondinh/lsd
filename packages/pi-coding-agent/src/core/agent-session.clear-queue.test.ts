import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { AgentSession } from "./agent-session.js";

describe("AgentSession.clearQueue", () => {
	it("avoids duplicate queued prompts when session and agent queues mirror the same user message", () => {
		const clearAllQueues = mock.fn(() => {});
		const fakeSession = {
			_steeringMessages: ["make it in the main accent color"],
			_followUpMessages: [],
			agent: {
				drainUserMessages: () => ({
					steering: [{ role: "user", content: [{ type: "text", text: "make it in the main accent color" }] }],
					followUp: [],
				}),
				clearAllQueues,
			},
		} as any;

		const result = AgentSession.prototype.clearQueue.call(fakeSession);

		assert.deepEqual(result, {
			steering: ["make it in the main accent color"],
			followUp: [],
		});
		assert.deepEqual(fakeSession._steeringMessages, []);
		assert.deepEqual(fakeSession._followUpMessages, []);
		assert.equal(clearAllQueues.mock.callCount(), 1);
	});

	it("keeps extra preserved messages that are not present in session-tracked arrays", () => {
		const fakeSession = {
			_steeringMessages: ["first"],
			_followUpMessages: [],
			agent: {
				drainUserMessages: () => ({
					steering: [
						{ role: "user", content: [{ type: "text", text: "first" }] },
						{ role: "user", content: [{ type: "text", text: "second" }] },
					],
					followUp: [],
				}),
				clearAllQueues: () => {},
			},
		} as any;

		const result = AgentSession.prototype.clearQueue.call(fakeSession);
		assert.deepEqual(result.steering, ["first", "second"]);
	});
});
