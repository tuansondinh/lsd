import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { AgentSession } from "./agent-session.js";

describe("AgentSession context usage caching", () => {
    it("memoizes getContextUsage until context changes", () => {
        let branchCalls = 0;
        const messages = [
            { role: "user", content: "hello" },
            {
                role: "assistant",
                content: [{ type: "text", text: "hi" }],
                usage: { input: 120, output: 30, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
                stopReason: "end_turn",
                provider: "test",
                model: "fast-model",
            },
        ] as any[];

        const fakeSession = {
            model: { provider: "test", id: "fast-model", contextWindow: 1000 },
            messages,
            sessionManager: {
                getBranch: () => {
                    branchCalls += 1;
                    return [];
                },
            },
            _contextUsageRevision: 0,
            _contextUsageCache: undefined,
        } as any;

        const first = AgentSession.prototype.getContextUsage.call(fakeSession);
        const second = AgentSession.prototype.getContextUsage.call(fakeSession);

        assert.equal(branchCalls, 1);
        assert.strictEqual(second, first);

        messages.push({ role: "user", content: "follow up" } as any);
        AgentSession.prototype["_invalidateContextUsageCache"].call(fakeSession);
        const third = AgentSession.prototype.getContextUsage.call(fakeSession);

        assert.equal(branchCalls, 2);
        assert.notStrictEqual(third, first);
        assert.ok((third?.tokens ?? 0) > (first?.tokens ?? 0));
    });

    it("clears cached context usage before emitting session events", () => {
        const listener = mock.fn(() => { });
        const fakeSession = {
            _contextUsageRevision: 3,
            _contextUsageCache: {
                revision: 3,
                modelKey: "test/model:1000",
                usage: { tokens: 123, contextWindow: 1000, percent: 12.3 },
            },
            _eventListeners: [listener],
            _invalidateContextUsageCache: AgentSession.prototype["_invalidateContextUsageCache"],
        } as any;

        AgentSession.prototype["_emit"].call(fakeSession, { type: "session_state_changed", reason: "set_model" });

        assert.equal(fakeSession._contextUsageRevision, 4);
        assert.equal(fakeSession._contextUsageCache, undefined);
        assert.equal(listener.mock.callCount(), 1);
    });

    it("invalidates cached context usage for immediate bash history writes", () => {
        const invalidate = mock.fn(() => { });
        const appendMessage = mock.fn(() => { });
        const fakeSession = {
            isStreaming: false,
            agent: { appendMessage },
            sessionManager: { appendMessage },
            _invalidateContextUsageCache: invalidate,
        } as any;

        AgentSession.prototype.recordBashResult.call(
            fakeSession,
            "pwd",
            { output: "/tmp", exitCode: 0, cancelled: false, truncated: false, fullOutputPath: undefined, sandboxed: false },
        );

        assert.equal(invalidate.mock.callCount(), 1);
        assert.equal(appendMessage.mock.callCount(), 2);
    });
});
