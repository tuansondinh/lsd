import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

interface CapturedCommand {
    name: string;
    description?: string;
    getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string; description?: string }> | null;
    handler: (args: string, ctx: unknown) => Promise<void>;
}

function createWorkspaceTempDir(prefix: string): string {
    const base = join(process.cwd(), ".tmp-test");
    mkdirSync(base, { recursive: true });
    return mkdtempSync(join(base, prefix));
}

async function loadCommands(): Promise<Map<string, CapturedCommand>> {
    const { default: registerRemoteQuestionsExtension } = await import("../resources/extensions/remote-questions/index.ts");

    const commands = new Map<string, CapturedCommand>();
    const mockPi = {
        on() { },
        sendMessage() { },
        registerCommand(name: string, options: Omit<CapturedCommand, "name">) {
            commands.set(name, { name, ...options });
        },
    };

    const isolatedHome = createWorkspaceTempDir("lsd-remote-questions-");
    const previousLsdHome = process.env.LSD_HOME;
    try {
        process.env.LSD_HOME = isolatedHome;
        registerRemoteQuestionsExtension(mockPi as any);
    } finally {
        if (previousLsdHome === undefined) {
            delete process.env.LSD_HOME;
        } else {
            process.env.LSD_HOME = previousLsdHome;
        }
        rmSync(isolatedHome, { recursive: true, force: true });
    }

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
    assert.ok(root.some((item) => item.value === "telegram autoconnect"));

    const nested = lsd!.getArgumentCompletions!("telegram a") ?? [];
    assert.deepEqual(nested.map((item) => item.value), [
        "telegram autoconnect",
        "telegram autoconnect on",
        "telegram autoconnect off",
        "telegram autoconnect status",
    ]);
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

test("telegram relay startup preserves existing owner and state files", async () => {
    const tmpHome = createWorkspaceTempDir("lsd-telegram-scrub-");
    const previousLsdHome = process.env.LSD_HOME;

    try {
        process.env.LSD_HOME = tmpHome;

        const ownersDir = join(tmpHome, "runtime", "relay", "owners");
        const sessionADir = join(tmpHome, "runtime", "relay", "session-a");
        const sessionBDir = join(tmpHome, "runtime", "relay", "session-b");
        const { mkdir, writeFile } = await import("node:fs/promises");
        const ownerA = { ownerId: "a", chatId: "111", sessionKey: "session-a", updatedAt: Date.now() };
        const ownerB = { ownerId: "b", chatId: "222", sessionKey: "session-b", updatedAt: Date.now() };
        const stateA = { connected: true, chatId: "111" };
        const stateB = { connected: false, awaitingHandshake: true, chatId: "222" };
        await Promise.all([
            mkdir(ownersDir, { recursive: true }),
            mkdir(sessionADir, { recursive: true }),
            mkdir(sessionBDir, { recursive: true }),
        ]);
        await Promise.all([
            writeFile(join(ownersDir, "telegram-111.json"), JSON.stringify(ownerA) + "\n"),
            writeFile(join(ownersDir, "telegram-222.json"), JSON.stringify(ownerB) + "\n"),
            writeFile(join(sessionADir, "telegram-live.json"), JSON.stringify(stateA) + "\n"),
            writeFile(join(sessionBDir, "telegram-live.json"), JSON.stringify(stateB) + "\n"),
        ]);

        const { TelegramLiveRelay } = await import("../resources/extensions/remote-questions/telegram-live-relay.ts");
        new TelegramLiveRelay({ sendMessage() { } } as any);

        assert.deepEqual(JSON.parse(readFileSync(join(ownersDir, "telegram-111.json"), "utf-8")), ownerA);
        assert.deepEqual(JSON.parse(readFileSync(join(ownersDir, "telegram-222.json"), "utf-8")), ownerB);
        assert.deepEqual(JSON.parse(readFileSync(join(sessionADir, "telegram-live.json"), "utf-8")), stateA);
        assert.deepEqual(JSON.parse(readFileSync(join(sessionBDir, "telegram-live.json"), "utf-8")), stateB);
    } finally {
        if (previousLsdHome === undefined) {
            delete process.env.LSD_HOME;
        } else {
            process.env.LSD_HOME = previousLsdHome;
        }
        rmSync(tmpHome, { recursive: true, force: true });
    }
});

test("telegram relay shutdown clears awaiting-handshake ownership and state", async () => {
    const tmpHome = createWorkspaceTempDir("lsd-telegram-relay-");
    const previousLsdHome = process.env.LSD_HOME;

    try {
        process.env.LSD_HOME = tmpHome;

        const { TelegramLiveRelay } = await import("../resources/extensions/remote-questions/telegram-live-relay.ts");
        const relay = new TelegramLiveRelay({
            sendMessage() { },
        } as any) as any;

        relay.state = {
            connected: false,
            awaitingHandshake: true,
            nonce: "ABC123",
            channel: "telegram",
            chatId: "123456789",
            lastUpdateId: 42,
            connectedAt: Date.now(),
            sessionKey: "test-session",
        };

        assert.equal(relay.claimOwnership(), true, "expected relay to claim ownership");
        relay.writeState();

        const ownerPath = join(tmpHome, "runtime", "relay", "owners", "telegram-123456789.json");
        const relayDir = join(tmpHome, "runtime", "relay");
        const sessionDir = readdirSync(relayDir).find((entry) => entry !== "owners");
        assert.ok(sessionDir, "expected a relay session directory");
        const statePath = join(relayDir, sessionDir!, "telegram-live.json");

        assert.equal(JSON.parse(readFileSync(ownerPath, "utf-8")).ownerId, relay.ownerId);
        assert.equal(JSON.parse(readFileSync(statePath, "utf-8")).awaitingHandshake, true);

        await relay.onSessionShutdown({});

        assert.equal(relay.state, null);
        assert.equal(JSON.parse(readFileSync(ownerPath, "utf-8")), null);
        assert.equal(JSON.parse(readFileSync(statePath, "utf-8")), null);
    } finally {
        if (previousLsdHome === undefined) {
            delete process.env.LSD_HOME;
        } else {
            process.env.LSD_HOME = previousLsdHome;
        }
        rmSync(tmpHome, { recursive: true, force: true });
    }
});

test("telegram relay /commands lists built-in and extension slash commands", async () => {
    const sent: string[] = [];
    const { TelegramLiveRelay } = await import("../resources/extensions/remote-questions/telegram-live-relay.ts");
    const relay = new TelegramLiveRelay({
        sendMessage() { },
        getCommands() {
            return [{ name: "clear", description: "Alias for /new" }, { name: "review", description: "Review code changes" }];
        },
    } as any) as any;

    relay.state = {
        connected: true,
        channel: "telegram",
        chatId: "123456789",
        lastUpdateId: 0,
        connectedAt: Date.now(),
        sessionKey: "test-session",
    };
    relay.safeSendTelegram = async (text: string) => {
        sent.push(text);
        return null;
    };

    await relay.handleUpdate({
        update_id: 1,
        message: { text: "/commands", chat: { id: "123456789" }, from: { is_bot: false } },
    });

    assert.ok(sent.some((message) => message.includes("/clear")), "expected /clear in commands list");
    assert.ok(sent.some((message) => message.includes("/review")), "expected extension command in commands list");
});

test("telegram relay answers pending extension UI select prompts", async () => {
    const sent: string[] = [];
    let responded: any = null;
    const { TelegramLiveRelay } = await import("../resources/extensions/remote-questions/telegram-live-relay.ts");
    const relay = new TelegramLiveRelay({
        sendMessage() { },
        getCommands() { return []; },
    } as any) as any;

    relay.state = {
        connected: true,
        channel: "telegram",
        chatId: "123456789",
        lastUpdateId: 0,
        connectedAt: Date.now(),
        sessionKey: "test-session",
    };
    relay.safeSendTelegram = async (text: string) => {
        sent.push(text);
        return null;
    };

    relay.onExtensionUiRequest({
        id: "ui-1",
        method: "select",
        title: "Pick deployment mode",
        options: ["Safe", "Fast"],
        respond(response: any) {
            responded = response;
            return true;
        },
    });

    await relay.handleUpdate({
        update_id: 2,
        message: { text: "2", chat: { id: "123456789" }, from: { is_bot: false } },
    });

    assert.deepEqual(responded, { value: "Fast" });
    assert.ok(sent.some((message) => message.includes("Pick deployment mode")), "expected prompt text to be sent");
    assert.ok(sent.some((message) => message.includes("✅ Answer received.")), "expected acknowledgement to be sent");
});
