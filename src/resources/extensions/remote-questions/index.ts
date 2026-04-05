import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";
import type { AutocompleteItem } from "@gsd/pi-tui";
import { handleRemote } from "./remote-command.js";
import { TelegramLiveRelay } from "./telegram-live-relay.js";

const REMOTE_ARGUMENTS: AutocompleteItem[] = [
    { value: "slack", label: "slack", description: "Connect remote questions to Slack" },
    { value: "discord", label: "discord", description: "Connect remote questions to Discord" },
    { value: "telegram", label: "telegram", description: "Connect remote questions to Telegram" },
    { value: "status", label: "status", description: "Show current remote questions status" },
    { value: "disconnect", label: "disconnect", description: "Disconnect the configured remote channel" },
];

const LSD_ARGUMENTS: AutocompleteItem[] = [
    { value: "remote", label: "remote", description: "Remote questions commands" },
    { value: "remote slack", label: "remote slack", description: "Connect remote questions to Slack" },
    { value: "remote discord", label: "remote discord", description: "Connect remote questions to Discord" },
    { value: "remote telegram", label: "remote telegram", description: "Connect remote questions to Telegram" },
    { value: "remote status", label: "remote status", description: "Show current remote questions status" },
    { value: "remote disconnect", label: "remote disconnect", description: "Disconnect the configured remote channel" },
    { value: "telegram", label: "telegram", description: "Telegram live relay commands" },
    { value: "telegram connect", label: "telegram connect", description: "Start the Telegram live relay" },
    { value: "telegram status", label: "telegram status", description: "Show Telegram live relay status" },
    { value: "telegram disconnect", label: "telegram disconnect", description: "Disconnect the Telegram live relay" },
];

function filterArgumentCompletions(prefix: string, items: AutocompleteItem[]): AutocompleteItem[] | null {
    const normalized = prefix.toLowerCase().replace(/\s+/g, " ").trimStart();
    const query = normalized.trimEnd();
    const filtered = items.filter((item) => item.value.startsWith(query));
    return filtered.length > 0 ? filtered : null;
}

function showLsdUsage(ctx: ExtensionCommandContext): void {
    ctx.ui.notify(
        [
            "LSD remote questions:",
            "  /lsd remote",
            "  /lsd remote slack",
            "  /lsd remote discord",
            "  /lsd remote telegram",
            "  /lsd remote status",
            "  /lsd remote disconnect",
            "",
            "Telegram live relay:",
            "  /lsd telegram connect",
            "  /lsd telegram status",
            "  /lsd telegram disconnect",
        ].join("\n"),
        "info",
    );
}

export default function RemoteQuestionsExtension(pi: ExtensionAPI): void {
    const relay = new TelegramLiveRelay(pi);

    pi.on("message_start", (event) => relay.onMessageStart(event));
    pi.on("message_update", (event) => relay.onMessageUpdate(event));
    pi.on("message_end", (event) => relay.onMessageEnd(event));
    pi.on("tool_execution_start", (event) => relay.onToolExecutionStart({ toolCallId: event.toolCallId, toolName: event.toolName, args: event.args }));
    pi.on("tool_execution_end", (event) => relay.onToolExecutionEnd({ toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError, result: event.result }));
    pi.on("session_switch", async (event) => relay.onSessionSwitch(event));
    pi.on("session_fork", async (event) => relay.onSessionFork(event));
    pi.on("session_shutdown", async (event) => relay.onSessionShutdown(event));
    pi.on("session_before_compact", (event) => relay.onSessionBeforeCompact(event));

    pi.registerCommand("remote", {
        description: "Configure remote questions (Slack, Discord, Telegram)",
        getArgumentCompletions: (prefix: string) => filterArgumentCompletions(prefix, REMOTE_ARGUMENTS),
        handler: async (args: string, ctx: ExtensionCommandContext) => {
            await handleRemote(args, ctx, pi);
        },
    });

    pi.registerCommand("lsd", {
        description: "LSD command alias for remote questions",
        getArgumentCompletions: (prefix: string) => filterArgumentCompletions(prefix, LSD_ARGUMENTS),
        handler: async (args: string, ctx: ExtensionCommandContext) => {
            const trimmed = args.trim();
            if (trimmed === "" || trimmed === "help") {
                showLsdUsage(ctx);
                return;
            }

            if (await relay.handleLsdTelegram(trimmed, ctx)) {
                return;
            }

            if (trimmed === "remote" || trimmed.startsWith("remote ")) {
                await handleRemote(trimmed.replace(/^remote\s*/, "").trim(), ctx, pi);
                return;
            }

            ctx.ui.notify(`Unknown /lsd subcommand: ${trimmed}`, "warning");
            showLsdUsage(ctx);
        },
    });
}
