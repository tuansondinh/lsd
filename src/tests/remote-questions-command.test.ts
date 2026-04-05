import test from "node:test";
import assert from "node:assert/strict";

interface CapturedCommand {
    name: string;
    description?: string;
    getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string; description?: string }> | null;
    handler: (args: string, ctx: unknown) => Promise<void>;
}

async function loadCommands(): Promise<Map<string, CapturedCommand>> {
    const { default: registerRemoteQuestionsExtension } = await import("../resources/extensions/remote-questions/index.ts");

    const commands = new Map<string, CapturedCommand>();
    const mockPi = {
        on() { },
        registerCommand(name: string, options: Omit<CapturedCommand, "name">) {
            commands.set(name, { name, ...options });
        },
    };

    registerRemoteQuestionsExtension(mockPi as any);
    return commands;
}

test("/lsd exposes remote and telegram argument completions", async () => {
    const commands = await loadCommands();
    const lsd = commands.get("lsd");

    assert.ok(lsd, "expected /lsd to be registered");
    assert.ok(lsd?.getArgumentCompletions, "expected /lsd to expose argument completions");

    const root = lsd!.getArgumentCompletions!("") ?? [];
    assert.ok(root.some((item) => item.value === "remote"));
    assert.ok(root.some((item) => item.value === "telegram"));
    assert.ok(root.some((item) => item.value === "telegram disconnect"));

    const nested = lsd!.getArgumentCompletions!("telegram d") ?? [];
    assert.deepEqual(nested.map((item) => item.value), ["telegram disconnect"]);
});

test("/remote exposes channel and status argument completions", async () => {
    const commands = await loadCommands();
    const remote = commands.get("remote");

    assert.ok(remote, "expected /remote to be registered");
    assert.ok(remote?.getArgumentCompletions, "expected /remote to expose argument completions");

    const root = remote!.getArgumentCompletions!("") ?? [];
    assert.ok(root.some((item) => item.value === "slack"));
    assert.ok(root.some((item) => item.value === "discord"));
    assert.ok(root.some((item) => item.value === "telegram"));
    assert.ok(root.some((item) => item.value === "status"));
    assert.ok(root.some((item) => item.value === "disconnect"));

    const filtered = remote!.getArgumentCompletions!("te") ?? [];
    assert.deepEqual(filtered.map((item) => item.value), ["telegram"]);
});
