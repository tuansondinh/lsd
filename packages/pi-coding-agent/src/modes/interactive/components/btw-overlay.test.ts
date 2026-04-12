import test from "node:test";
import assert from "node:assert/strict";
import stripAnsi from "strip-ansi";
import type { Context, Model, SimpleStreamOptions, Message } from "@gsd/pi-ai";
import type { TUI } from "@gsd/pi-tui";
import { BtwOverlayComponent } from "./btw-overlay.js";
import { getMarkdownTheme, initTheme } from "../theme/theme.js";

initTheme();

function makeUi(rows = 40): TUI {
    return { terminal: { rows } } as unknown as TUI;
}

function makeModel(): Model<any> {
    return {
        id: "test-model",
        name: "Test Model",
        api: "openai-completions",
        provider: "test",
        baseUrl: "",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 4096,
        maxTokens: 1024,
    } as unknown as Model<any>;
}

function makeMessages(): Message[] {
    return [
        {
            role: "user",
            content: [{ type: "text", text: "hello" }],
            timestamp: Date.now(),
        },
    ];
}

function renderText(component: BtwOverlayComponent): string {
    return stripAnsi(component.render(80).join("\n"));
}

async function flushTurns(count = 3): Promise<void> {
    for (let i = 0; i < count; i++) {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}

test("BtwOverlayComponent renders initial question and placeholder before response", async () => {
    const component = new BtwOverlayComponent(
        "What is btw?",
        makeModel(),
        "system",
        makeMessages(),
        getMarkdownTheme(),
        makeUi(),
        () => undefined,
        () => undefined,
        () => ({
            async *[Symbol.asyncIterator]() {
                await new Promise(() => undefined);
            },
        }) as any,
    );

    await flushTurns();
    const text = renderText(component);
    assert.match(text, /btw/);
    assert.match(text, /You/);
    assert.match(text, /What is btw\?/);
    assert.match(text, /Awaiting response/);
    assert.match(text, /Ask follow-up/);
    component.dispose();
});

test("BtwOverlayComponent supports follow-up turns and reuses overlay-local history", async () => {
    const calls: Array<{ context: Context; options?: SimpleStreamOptions }> = [];
    const responses = [
        [
            { type: "text_delta", delta: "First answer" },
            { type: "done" },
        ],
        [
            { type: "text_delta", delta: "Second answer" },
            { type: "done" },
        ],
    ];

    const streamFn = ((_: Model<any>, context: Context, options?: SimpleStreamOptions) => {
        calls.push({ context, options });
        const response = responses[calls.length - 1] ?? [];
        return {
            async *[Symbol.asyncIterator]() {
                for (const event of response) {
                    yield event;
                }
            },
        };
    }) as any;

    const component = new BtwOverlayComponent(
        "What is btw?",
        makeModel(),
        "system",
        makeMessages(),
        getMarkdownTheme(),
        makeUi(),
        () => undefined,
        () => undefined,
        streamFn,
        { apiKey: "test-key", sessionId: "session-1" },
    );

    await flushTurns();
    for (const ch of "next") {
        component.handleInput(ch);
    }
    component.handleInput("\n");
    await flushTurns();

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.options?.apiKey, "test-key");
    assert.equal(calls[1]?.options?.sessionId, "session-1");
    assert.equal(calls[0]?.context.messages.length, 2);
    assert.equal(calls[1]?.context.messages.length, 4);
    assert.equal(calls[1]?.context.messages[1]?.role, "user");
    assert.equal(calls[1]?.context.messages[2]?.role, "assistant");
    assert.deepEqual(calls[1]?.context.messages[3]?.content, [{ type: "text", text: "next" }]);

    const text = renderText(component);
    assert.match(text, /First answer/);
    assert.match(text, /Second answer/);
    component.dispose();
});

test("BtwOverlayComponent aborts active stream on Escape", async () => {
    let capturedSignal: AbortSignal | undefined;
    let dismissed = false;
    const streamFn = ((_model: any, _context: any, options?: { signal?: AbortSignal }) => {
        capturedSignal = options?.signal;
        return {
            async *[Symbol.asyncIterator]() {
                await new Promise<void>((resolve) => {
                    capturedSignal?.addEventListener("abort", () => resolve(), { once: true });
                });
            },
        };
    }) as any;

    const component = new BtwOverlayComponent(
        "What is btw?",
        makeModel(),
        "system",
        makeMessages(),
        getMarkdownTheme(),
        makeUi(),
        () => {
            dismissed = true;
        },
        () => undefined,
        streamFn,
    );

    await flushTurns();
    component.handleInput("\u001b");
    await flushTurns();

    assert.equal(dismissed, true);
    assert.equal(capturedSignal?.aborted, true);
});
