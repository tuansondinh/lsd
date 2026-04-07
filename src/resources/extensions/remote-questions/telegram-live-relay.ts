import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@gsd/pi-coding-agent";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { loadEffectivePreferences } from "../shared/preferences.js";
import { resolveRemoteConfig } from "./config.js";
import { apiRequest } from "./http-client.js";
import { telegramPullUpdates, telegramSyncLatestUpdateId, telegramMarkConsumerSeen } from "./telegram-update-stream.js";

const TELEGRAM_API = "https://api.telegram.org";
const ASSISTANT_FLUSH_MS = 1200;
const TELEGRAM_MESSAGE_LIMIT = 4000;
const RELAY_OWNER_STALE_MS = 2 * 60 * 1000;

interface RelayOwnerRecord {
  ownerId: string;
  sessionKey: string;
  chatId: string;
  updatedAt: number;
}

interface RelayState {
  connected: boolean;
  channel: "telegram";
  chatId: string;
  lastUpdateId: number;
  connectedAt: number;
  sessionKey: string;
  nonce?: string;
  awaitingHandshake?: boolean;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    chat?: { id?: number | string; type?: string };
    from?: { id?: number | string; is_bot?: boolean; username?: string };
  };
}

interface PendingUiRequest {
  id: string;
  method: "select" | "confirm" | "input" | "editor";
  title: string;
  options?: string[];
  allowMultiple?: boolean;
  respond: (response: { value: string } | { values: string[] } | { confirmed: boolean } | { cancelled: true }) => boolean;
}

type AbortableExtensionAPI = ExtensionAPI & { abort(): void };

export class TelegramLiveRelay {
  private readonly pi: ExtensionAPI;
  private state: RelayState | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private shuttingDown = false;
  private stopRequested = false;
  private botUserId: number | null = null;
  private readonly consumerId: string;
  private readonly ownerId: string;
  private readonly recentInboundFingerprints = new Map<string, number>();
  private readonly toolArgsByCallId = new Map<string, Record<string, unknown> | undefined>();
  private readonly toolStartMessageIds = new Map<string, number>();
  private assistantDraftMessageId: number | null = null;
  private assistantDraftCreation: Promise<number | null> | null = null;
  private assistantDraftText = "";
  private assistantFlushTimer: NodeJS.Timeout | null = null;
  private lastAssistantFlushAt = 0;
  private pendingUiRequest: PendingUiRequest | null = null;

  constructor(pi: ExtensionAPI) {
    this.pi = pi;
    this.consumerId = `telegram-live:${randomUUID()}`;
    this.ownerId = randomUUID();
    this.state = this.readState();
  }

  async connect(ctx: ExtensionCommandContext): Promise<void> {
    await this.connectInternal((message, level) => ctx.ui.notify(message, level));
  }

  async autoConnectIfEnabled(): Promise<void> {
    const enabled = isTelegramRelayAutoConnectEnabled();
    if (!enabled) return;

    this.sendCliHint("Telegram autoconnect enabled — connecting live relay…", "info");

    if (this.state?.connected || this.state?.awaitingHandshake) {
      this.startPollingLoop();
      this.setStatus();
      this.sendCliHint(
        this.state.connected
          ? `Telegram live relay already connected (${this.state.chatId}).`
          : `Telegram live relay awaiting handshake (${this.state.chatId}).`,
        "info",
      );
      return;
    }

    await this.connectInternal((message, level) => this.sendCliHint(message, level));
  }

  private async connectInternal(notify?: (message: string, level: "info" | "warning" | "error" | "success") => void): Promise<void> {
    const emit = notify ?? (() => undefined);
    const config = resolveRemoteConfig();
    if (!config || config.channel !== "telegram") {
      emit("Telegram is not configured. Run /lsd remote telegram first.", "warning");
      return;
    }

    try {
      const me = await this.telegramApi(config.token, "getMe");
      if (!me?.ok || !me?.result?.id) {
        emit("Telegram bot validation failed. Re-run /lsd remote telegram.", "error");
        return;
      }
      this.botUserId = me.result.id;

      const baseline = await telegramSyncLatestUpdateId(config.token, ["message"]);
      telegramMarkConsumerSeen(config.token, this.consumerId, baseline);
      const nonce = randomUUID().slice(0, 6).toUpperCase();
      this.state = {
        connected: false,
        awaitingHandshake: true,
        nonce,
        channel: "telegram",
        chatId: config.channelId,
        lastUpdateId: baseline,
        connectedAt: Date.now(),
        sessionKey: sessionKey(),
      };
      this.writeState();
      if (!this.claimOwnership()) {
        emit(`Another LSD session already owns Telegram relay for chat ${config.channelId}. Disconnect it first.`, "warning");
        this.state = null;
        this.writeState();
        this.setStatus();
        return;
      }
      this.startPollingLoop();
      emit(`Telegram relay handshake started for chat ${config.channelId}. Confirm in Telegram with /bind ${nonce}.`, "success");
      await this.safeSendTelegram([
        "🔐 LSD live relay handshake",
        "",
        `Reply with: /bind ${nonce}`,
        "",
        "Only this bound chat can control the current LSD session.",
      ].join("\n"), true);
      this.setStatus();
    } catch (err) {
      emit(`Telegram live relay connect failed: ${this.errorMessage(err)}`, "error");
    }
  }

  async disconnect(ctx?: ExtensionCommandContext, reason?: string): Promise<void> {
    const wasConnected = !!this.state?.connected;
    this.stopPollingLoop();
    this.toolArgsByCallId.clear();
    this.toolStartMessageIds.clear();
    this.releaseOwnership();
    if (wasConnected) {
      const message = reason ? `Telegram live relay disconnected: ${reason}` : "Telegram live relay disconnected.";
      ctx?.ui.notify(message, "info");
      if (!this.shuttingDown) {
        await this.safeSendTelegram(`🔌 ${message}`);
      }
    }
    this.state = null;
    this.writeState();
    this.setStatus();
  }

  async status(ctx: ExtensionCommandContext): Promise<void> {
    if (this.state) {
      await this.pollOnce();
      await this.tryDirectHandshakeCatchup();
    }
    if (!this.state) {
      ctx.ui.notify("Telegram live relay: disconnected. Use /lsd telegram connect.", "info");
      return;
    }
    const since = new Date(this.state.connectedAt).toLocaleString();
    ctx.ui.notify([
      `Telegram live relay: ${this.state.connected ? "connected" : this.state.awaitingHandshake ? "awaiting handshake" : "disconnected"}`,
      `  chat: ${this.state.chatId}`,
      `  connected: ${since}`,
      `  last_update_id: ${this.state.lastUpdateId}`,
      ...(this.state.awaitingHandshake && this.state.nonce ? [`  nonce: ${this.state.nonce}`] : []),
    ].join("\n"), "info");
  }

  async handleLsdTelegram(args: string, ctx: ExtensionCommandContext): Promise<boolean> {
    const trimmed = args.trim();
    if (!trimmed.startsWith("telegram")) return false;
    const sub = trimmed.replace(/^telegram\s*/, "").trim();
    if (sub === "" || sub === "help") {
      ctx.ui.notify([
        "Telegram live relay:",
        "  /lsd telegram connect",
        "  /lsd telegram status",
        "  /lsd telegram disconnect",
        "  /lsd telegram autoconnect [on|off|status]",
      ].join("\n"), "info");
      return true;
    }
    if (sub === "connect") {
      await this.connect(ctx);
      return true;
    }
    if (sub === "status") {
      await this.status(ctx);
      return true;
    }
    if (sub === "disconnect") {
      await this.disconnect(ctx);
      return true;
    }
    if (sub === "autoconnect" || sub === "auto-connect" || sub === "autoconnect status" || sub === "auto-connect status") {
      const enabled = isTelegramRelayAutoConnectEnabled();
      ctx.ui.notify(`Telegram auto-connect is ${enabled ? "enabled" : "disabled"}.`, "info");
      return true;
    }
    if (sub === "autoconnect on" || sub === "auto-connect on") {
      setTelegramRelayAutoConnect(true);
      ctx.ui.notify("Telegram auto-connect enabled. LSD will auto-run /lsd telegram connect on startup.", "success");
      return true;
    }
    if (sub === "autoconnect off" || sub === "auto-connect off") {
      setTelegramRelayAutoConnect(false);
      ctx.ui.notify("Telegram auto-connect disabled.", "info");
      return true;
    }
    ctx.ui.notify(`Unknown /lsd telegram subcommand: ${sub}`, "warning");
    return true;
  }

  onMessageStart(event: { message?: { role?: string } }): void {
    if (!this.state?.connected) return;
    if (event.message?.role !== "assistant") return;
    this.stopRequested = false;
    this.assistantDraftText = "";
    this.lastAssistantFlushAt = 0;
    void this.ensureAssistantDraftMessage();
  }

  onMessageUpdate(event: { message?: { role?: string; content?: unknown } }): void {
    if (!this.state?.connected) return;
    if (event.message?.role !== "assistant") return;
    if (this.stopRequested) return;
    const text = extractText(event.message.content).trim();
    if (!text) return;
    this.assistantDraftText = text;
    this.scheduleAssistantFlush();
  }

  onMessageEnd(event: { message?: { role?: string; content?: unknown } }): void {
    if (!this.state?.connected) return;
    if (event.message?.role !== "assistant") return;
    if (this.stopRequested) {
      this.stopRequested = false;
      this.assistantDraftText = "";
      void this.clearAssistantDraft();
      return;
    }
    const text = extractText(event.message.content);
    if (!text.trim()) return;
    if (this.wasRecentlyReceivedFromTelegram(text)) return;
    this.assistantDraftText = text;
    void this.finalizeAssistantDraft();
  }

  onToolExecutionStart(event: { toolCallId?: string; toolName: string; args?: Record<string, unknown> }): void {
    if (!this.state?.connected) return;

    const startText = formatToolStart(event.toolName, event.args);
    if (!event.toolCallId) {
      void this.safeSendTelegram(startText);
      return;
    }

    this.toolArgsByCallId.set(event.toolCallId, event.args);
    void this.sendToolStartMessage(event.toolCallId, startText);
  }

  onToolExecutionEnd(event: { toolCallId?: string; toolName: string; isError: boolean; result?: unknown; args?: Record<string, unknown> }): void {
    if (!this.state?.connected) return;
    const args = event.args ?? (event.toolCallId ? this.toolArgsByCallId.get(event.toolCallId) : undefined);
    if (event.toolCallId) this.toolArgsByCallId.delete(event.toolCallId);

    const endText = formatToolEnd(event.toolName, args, event.result, event.isError);
    if (event.toolCallId) {
      void this.updateToolStartMessage(event.toolCallId, endText);
      return;
    }
    void this.safeSendTelegram(endText);
  }

  onExtensionUiRequest(event: {
    id: string;
    method: "select" | "confirm" | "input" | "editor";
    title: string;
    options?: string[];
    allowMultiple?: boolean;
    respond: (response: { value: string } | { values: string[] } | { confirmed: boolean } | { cancelled: true }) => boolean;
  }): void {
    if (!this.state?.connected) return;
    this.pendingUiRequest = {
      id: event.id,
      method: event.method,
      title: event.title,
      options: event.options,
      allowMultiple: event.allowMultiple,
      respond: event.respond,
    };
    void this.safeSendTelegram(this.formatPendingUiRequest(event), true);
  }

  onExtensionUiResponse(event: {
    id: string;
    source: "local" | "extension" | "timeout" | "abort";
    response: { value: string } | { values: string[] } | { confirmed: boolean } | { cancelled: true };
  }): void {
    if (this.pendingUiRequest?.id === event.id) {
      this.pendingUiRequest = null;
    }
    if (!this.state?.connected) return;
    if (event.source === "local") {
      void this.safeSendTelegram("ℹ️ Interactive prompt resolved locally.", true);
      return;
    }
    if (event.source === "timeout" || event.source === "abort" || ("cancelled" in event.response && event.response.cancelled)) {
      void this.safeSendTelegram("ℹ️ Interactive prompt was cancelled.", true);
    }
  }

  async onSessionSwitch(_event: unknown): Promise<void> {
    if (!this.state) return;
    await this.disconnect(undefined, "session switched");
  }

  async onSessionFork(_event: unknown): Promise<void> {
    if (!this.state) return;
    await this.disconnect(undefined, "session forked");
  }

  async onSessionShutdown(_event: unknown): Promise<void> {
    this.shuttingDown = true;
    if (!this.state) return;
    await this.disconnect(undefined, "session shutdown");
  }

  onSessionBeforeCompact(_event: unknown): void {
    if (!this.state?.connected) return;
    void this.safeSendTelegram("🗜️ LSD is compacting context. Relay stays connected.");
  }

  private safeSendPiMessage(message: Parameters<ExtensionAPI["sendMessage"]>[0]): void {
    try {
      this.pi.sendMessage(message);
    } catch (err) {
      const errorText = this.errorMessage(err);
      // During extension loading the runtime bridge is not ready yet.
      // Swallow this specific startup-time error so autoconnect never crashes LSD startup.
      if (errorText.includes("Extension runtime not initialized")) return;
      // Keep behavior non-fatal for relay status notifications.
      // eslint-disable-next-line no-console
      console.warn(`[remote-questions] failed to send extension message: ${errorText}`);
    }
  }

  private sendCliHint(message: string, level: "info" | "warning" | "error" | "success" = "info"): void {
    const prefix = level === "error" ? "❌" : level === "warning" ? "⚠️" : level === "success" ? "✅" : "ℹ️";
    this.safeSendPiMessage({
      customType: "telegram_live_relay_notice",
      content: `${prefix} ${message}`,
      display: true,
    });
  }

  private setStatus(): void {
    this.safeSendPiMessage({
      customType: "telegram_live_relay_status",
      content: this.state
        ? this.state.connected
          ? `Telegram live relay connected (${this.state.chatId})`
          : this.state.awaitingHandshake
            ? `Telegram live relay awaiting handshake (${this.state.chatId})`
            : "Telegram live relay disconnected"
        : "Telegram live relay disconnected",
      display: false,
      details: this.state
        ? {
            connected: this.state.connected,
            awaitingHandshake: !!this.state.awaitingHandshake,
            chatId: this.state.chatId,
            sessionKey: this.state.sessionKey,
          }
        : { connected: false },
    });
  }

  private startPollingLoop(): void {
    this.stopPollingLoop();
    const tick = async () => {
      if (this.isPolling || !this.state) return;
      if (!this.claimOwnership()) {
        this.stopPollingLoop();
        return;
      }
      this.isPolling = true;
      try {
        await this.pollOnce();
      } finally {
        this.isPolling = false;
        if (this.state) this.pollTimer = setTimeout(tick, 1500);
      }
    };
    this.pollTimer = setTimeout(tick, 250);
  }

  private stopPollingLoop(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private async pollOnce(): Promise<void> {
    const config = resolveRemoteConfig();
    if (!config || config.channel !== "telegram" || !this.state) return;
    if (!this.claimOwnership()) return;

    try {
      const updates = await telegramPullUpdates(config.token, this.consumerId, ["message"]);
      for (const update of updates) {
        if (typeof update.update_id === "number" && update.update_id > this.state.lastUpdateId) {
          this.state.lastUpdateId = update.update_id;
        }
        await this.handleUpdate(update);
      }
      this.writeState();
    } catch {
      // keep trying on next tick
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (!this.state || !update.message?.text) return;
    const msg = update.message;
    if (String(msg.chat?.id ?? "") !== this.state.chatId) return;
    if (msg.from?.is_bot) return;

    const textRaw = msg.text ?? "";
    const text = textRaw.trim();
    if (!text) return;

    if (this.state.awaitingHandshake && this.state.nonce) {
      if (text === `/bind ${this.state.nonce}`) {
        this.state.connected = true;
        this.state.awaitingHandshake = false;
        delete this.state.nonce;
        this.writeState();
        this.setStatus();
        await this.safeSendTelegram("🔗 LSD live relay connected. Send messages here to continue this session.", true);
      } else {
        await this.safeSendTelegram(`🔐 Handshake pending. Reply with /bind ${this.state.nonce}`, true);
      }
      return;
    }

    if (!this.state.connected) return;

    if (this.pendingUiRequest) {
      if (text === "/cancel") {
        const handled = this.pendingUiRequest.respond({ cancelled: true });
        if (handled) {
          await this.safeSendTelegram("❎ Cancelled interactive prompt.", true);
        }
        return;
      }
      const pendingResponse = this.parsePendingUiResponse(text, this.pendingUiRequest);
      if (pendingResponse) {
        const handled = this.pendingUiRequest.respond(pendingResponse);
        if (handled) {
          this.pendingUiRequest = null;
          await this.safeSendTelegram("✅ Answer received.", true);
        } else {
          await this.safeSendTelegram("⚠️ That prompt is no longer active.", true);
        }
        return;
      }
      if (text.startsWith("/")) {
        await this.safeSendTelegram("⚠️ Answer the active prompt first, or send /cancel to dismiss it.", true);
        return;
      }
    }

    if (text === "/stop") {
      this.stopRequested = true;
      (this.pi as AbortableExtensionAPI).abort();
      await this.clearAssistantDraft();
      await this.safeSendTelegram("🛑 Stopped current response.", true);
      return;
    }
    if (text === "/disconnect") {
      await this.safeSendTelegram("🔌 Disconnecting live relay.", true);
      await this.disconnect(undefined, "requested from Telegram");
      return;
    }
    if (text === "/status") {
      await this.safeSendTelegram(`✅ Live relay connected. Chat ${this.state.chatId}.`, true);
      return;
    }
    if (text === "/commands" || text.startsWith("/commands ")) {
      const prefix = text.replace(/^\/commands\s*/, "").trim();
      await this.safeSendTelegramChunks(this.listAvailableCommands(prefix));
      return;
    }
    if (text === "/help") {
      await this.safeSendTelegram([
        "Commands:",
        "  /status",
        "  /stop",
        "  /disconnect",
        "  /commands [prefix]",
        "  /help",
        "  /clear, /reload, /compact, /lsd ...",
        "  Any other non-slash text is forwarded to LSD.",
        "  If a prompt is active, reply with an answer or /cancel.",
      ].join("\n"), true);
      return;
    }

    this.rememberInboundText(text);

    if (text.startsWith("/")) {
      const handled = await this.pi.executeSlashCommand(text, { deliverAs: "followUp" });
      if (!handled) {
        await this.safeSendTelegram(`⚠️ Unknown slash command: ${text}`, true);
        return;
      }
      await this.safeSendTelegram(`⚡ Executed slash command: ${text}`, true);
      return;
    }

    await this.safeSendTelegram("📨 Message queued for LSD.", true);
    this.pi.sendUserMessage(text, { deliverAs: "followUp" });
  }

  private formatPendingUiRequest(event: { method: "select" | "confirm" | "input" | "editor"; title: string; options?: string[]; allowMultiple?: boolean }): string {
    if (event.method === "select" || event.method === "confirm") {
      const options = event.options ?? [];
      const lines = [
        `❓ ${event.title}`,
        "",
        ...options.map((option, index) => `${index + 1}. ${option}`),
        "",
        event.allowMultiple
          ? "Reply with comma-separated numbers or exact option labels. Send /cancel to cancel."
          : "Reply with a number or exact option text. Send /cancel to cancel.",
      ];
      return lines.join("\n");
    }

    return [
      `✍️ ${event.title}`,
      "",
      "Reply with your text answer.",
      "Send /cancel to cancel.",
    ].join("\n");
  }

  private parsePendingUiResponse(
    text: string,
    request: PendingUiRequest,
  ): { value: string } | { values: string[] } | { confirmed: boolean } | null {
    if (request.method === "input" || request.method === "editor") {
      return { value: text };
    }

    const options = request.options ?? [];
    const normalized = text.trim().toLowerCase();
    if (request.method === "confirm") {
      if (["1", "y", "yes", "true", "allow"].includes(normalized)) return { confirmed: true };
      if (["2", "n", "no", "false", "deny"].includes(normalized)) return { confirmed: false };
      const yesOption = options.find((option) => option.toLowerCase() === normalized);
      if (yesOption) return { confirmed: yesOption.toLowerCase().startsWith("y") };
      return null;
    }

    if (request.allowMultiple) {
      const parts = text.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length === 0) return null;
      const resolved = parts.map((part) => this.resolveOptionValue(part, options)).filter((value): value is string => !!value);
      if (resolved.length !== parts.length) return null;
      return { values: Array.from(new Set(resolved)) };
    }

    const value = this.resolveOptionValue(text, options);
    return value ? { value } : null;
  }

  private resolveOptionValue(input: string, options: string[]): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const numeric = Number.parseInt(trimmed, 10);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= options.length) {
      return options[numeric - 1] ?? null;
    }
    const exact = options.find((option) => option.toLowerCase() === trimmed.toLowerCase());
    if (exact) return exact;
    return null;
  }

  private listAvailableCommands(prefix: string): string {
    const builtin = [
      { name: "help", description: "Show slash command help" },
      { name: "new", description: "Start a new session" },
      { name: "clear", description: "Alias for /new" },
      { name: "compact", description: "Compact the current session" },
      { name: "reload", description: "Reload extensions, skills, prompts, and themes" },
      { name: "settings", description: "Open settings" },
      { name: "model", description: "Select model" },
      { name: "resume", description: "Resume another session" },
      { name: "quit", description: "Quit pi" },
    ];
    const merged = [...builtin, ...this.pi.getCommands().map((command) => ({ name: command.name, description: command.description ?? "" }))];
    const seen = new Set<string>();
    const filtered = merged.filter((command) => {
      if (seen.has(command.name)) return false;
      seen.add(command.name);
      return prefix ? command.name.startsWith(prefix) : true;
    });

    if (filtered.length === 0) {
      return prefix ? `No slash commands match "${prefix}".` : "No slash commands available.";
    }

    return [
      prefix ? `Available slash commands matching "${prefix}":` : "Available slash commands:",
      ...filtered.slice(0, 80).map((command) => `/${command.name}${command.description ? ` — ${command.description}` : ""}`),
      filtered.length > 80 ? `…and ${filtered.length - 80} more` : "",
    ].filter(Boolean).join("\n");
  }

  private claimOwnership(): boolean {
    if (!this.state?.chatId) return false;
    const current = readRelayOwner(this.state.chatId);
    const now = Date.now();
    if (current && current.ownerId !== this.ownerId && now - current.updatedAt < RELAY_OWNER_STALE_MS) {
      return false;
    }
    writeRelayOwner({
      ownerId: this.ownerId,
      sessionKey: this.state.sessionKey,
      chatId: this.state.chatId,
      updatedAt: now,
    });
    return true;
  }

  private releaseOwnership(): void {
    if (!this.state?.chatId) return;
    const current = readRelayOwner(this.state.chatId);
    if (current?.ownerId === this.ownerId) {
      removeRelayOwner(this.state.chatId);
    }
  }

  private scheduleAssistantFlush(): void {
    const now = Date.now();
    if (now - this.lastAssistantFlushAt >= ASSISTANT_FLUSH_MS) {
      void this.flushAssistantDraft();
      return;
    }
    if (this.assistantFlushTimer) return;
    this.assistantFlushTimer = setTimeout(() => {
      this.assistantFlushTimer = null;
      void this.flushAssistantDraft();
    }, ASSISTANT_FLUSH_MS);
  }

  private async ensureAssistantDraftMessage(): Promise<void> {
    if (this.assistantDraftMessageId) return;
    if (this.assistantDraftCreation) {
      const existingId = await this.assistantDraftCreation;
      if (typeof existingId === "number") this.assistantDraftMessageId = existingId;
      return;
    }

    this.assistantDraftCreation = (async () => {
      const result = await this.safeSendTelegram("🤖 Thinking…");
      const messageId = result?.result?.message_id;
      return typeof messageId === "number" ? messageId : null;
    })();

    try {
      const messageId = await this.assistantDraftCreation;
      if (typeof messageId === "number") {
        this.assistantDraftMessageId = messageId;
      }
    } finally {
      this.assistantDraftCreation = null;
    }
  }

  private async flushAssistantDraft(): Promise<void> {
    if (!this.assistantDraftText.trim()) return;
    await this.ensureAssistantDraftMessage();
    if (!this.assistantDraftMessageId) return;
    const text = chunkText(this.assistantDraftText, TELEGRAM_MESSAGE_LIMIT)[0] ?? this.assistantDraftText;
    this.lastAssistantFlushAt = Date.now();
    await this.safeEditTelegram(this.assistantDraftMessageId, text);
  }

  private async finalizeAssistantDraft(): Promise<void> {
    if (this.assistantFlushTimer) clearTimeout(this.assistantFlushTimer);
    this.assistantFlushTimer = null;

    const finalText = this.assistantDraftText.trim();
    if (!finalText) {
      // Delete the draft message if no content
      if (this.assistantDraftMessageId) {
        await this.safeDeleteTelegram(this.assistantDraftMessageId);
      }
      this.assistantDraftMessageId = null;
      this.assistantDraftCreation = null;
      this.assistantDraftText = "";
      return;
    }

    // Delete the draft message and send final response as new messages at the end
    if (this.assistantDraftMessageId) {
      await this.safeDeleteTelegram(this.assistantDraftMessageId);
      this.assistantDraftMessageId = null;
    }
    this.assistantDraftCreation = null;

    const chunks = chunkText(finalText, TELEGRAM_MESSAGE_LIMIT);
    if (chunks.length <= 1) {
      await this.safeSendTelegram(chunks[0] ?? finalText);
    } else {
      await this.safeSendTelegramChunks(finalText);
    }

    this.assistantDraftText = "";
  }

  private async clearAssistantDraft(): Promise<void> {
    if (this.assistantFlushTimer) clearTimeout(this.assistantFlushTimer);
    this.assistantFlushTimer = null;
    if (this.assistantDraftMessageId) {
      await this.safeDeleteTelegram(this.assistantDraftMessageId);
    }
    this.assistantDraftMessageId = null;
    this.assistantDraftCreation = null;
    this.assistantDraftText = "";
  }

  private async sendToolStartMessage(toolCallId: string, text: string): Promise<void> {
    const result = await this.safeSendTelegram(text);
    const messageId = result?.result?.message_id;
    if (typeof messageId === "number") {
      this.toolStartMessageIds.set(toolCallId, messageId);
    }
  }

  private async updateToolStartMessage(toolCallId: string, text: string): Promise<void> {
    const messageId = this.toolStartMessageIds.get(toolCallId);
    this.toolStartMessageIds.delete(toolCallId);
    if (typeof messageId === "number") {
      await this.safeEditTelegram(messageId, text);
      return;
    }
    await this.safeSendTelegram(text);
  }

  private async tryDirectHandshakeCatchup(): Promise<void> {
    if (!this.state?.awaitingHandshake || !this.state.nonce) return;
    const config = resolveRemoteConfig();
    if (!config || config.channel !== "telegram") return;

    try {
      const res = await this.telegramApi(config.token, "getUpdates", {
        timeout: 0,
        allowed_updates: ["message"],
      });
      if (!res?.ok || !Array.isArray(res.result)) return;

      const match = (res.result as TelegramUpdate[]).find((update) => {
        const text = update.message?.text?.trim();
        const chatId = String(update.message?.chat?.id ?? "");
        return chatId === this.state?.chatId && text === `/bind ${this.state?.nonce}`;
      });

      if (!match) return;

      this.state.connected = true;
      this.state.awaitingHandshake = false;
      if (typeof match.update_id === "number" && match.update_id > this.state.lastUpdateId) {
        this.state.lastUpdateId = match.update_id;
      }
      telegramMarkConsumerSeen(config.token, this.consumerId, this.state.lastUpdateId);
      delete this.state.nonce;
      this.writeState();
      this.setStatus();
      await this.safeSendTelegram("🔗 LSD live relay connected. Send messages here to continue this session.", true);
    } catch {
      // best effort
    }
  }

  private async safeSendTelegram(text: string, allowDuringHandshake = false): Promise<any> {
    const config = resolveRemoteConfig();
    if (!config || config.channel !== "telegram" || !this.state) return null;
    if (!allowDuringHandshake && !this.state.connected) return null;
    try {
      return await this.telegramApi(config.token, "sendMessage", {
        chat_id: this.state.chatId,
        text,
      });
    } catch {
      return null;
    }
  }

  private async safeEditTelegram(messageId: number, text: string): Promise<void> {
    const config = resolveRemoteConfig();
    if (!config || config.channel !== "telegram" || !this.state?.connected) return;
    try {
      await this.telegramApi(config.token, "editMessageText", {
        chat_id: this.state.chatId,
        message_id: messageId,
        text,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("message is not modified")) return;
      await this.safeSendTelegram(text);
    }
  }

  private async safeDeleteTelegram(messageId: number): Promise<void> {
    const config = resolveRemoteConfig();
    if (!config || config.channel !== "telegram" || !this.state?.connected) return;
    try {
      await this.telegramApi(config.token, "deleteMessage", {
        chat_id: this.state.chatId,
        message_id: messageId,
      });
    } catch {
      // ignore delete failures (message may not exist)
    }
  }

  private async safeSendTelegramChunks(text: string): Promise<void> {
    const chunks = chunkText(text, TELEGRAM_MESSAGE_LIMIT);
    for (let i = 0; i < chunks.length; i++) {
      const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n` : "";
      await this.safeSendTelegram(prefix + chunks[i]);
    }
  }

  private rememberInboundText(text: string): void {
    const now = Date.now();
    this.recentInboundFingerprints.set(fingerprint(text), now);
    for (const [key, ts] of this.recentInboundFingerprints) {
      if (now - ts > 2 * 60 * 1000) this.recentInboundFingerprints.delete(key);
    }
  }

  private wasRecentlyReceivedFromTelegram(text: string): boolean {
    const key = fingerprint(text);
    const ts = this.recentInboundFingerprints.get(key);
    if (!ts) return false;
    if (Date.now() - ts > 2 * 60 * 1000) {
      this.recentInboundFingerprints.delete(key);
      return false;
    }
    return true;
  }

  private async telegramApi(token: string, method: string, params?: Record<string, unknown>): Promise<any> {
    return apiRequest(`${TELEGRAM_API}/bot${token}/${method}`, "POST", params, { errorLabel: "Telegram API" });
  }

  private readState(): RelayState | null {
    const path = relayStatePath();
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as RelayState;
    } catch {
      return null;
    }
  }

  private writeState(): void {
    const path = relayStatePath();
    mkdirSync(dirname(path), { recursive: true });
    if (!this.state) {
      try { writeFileSync(path, "null\n", "utf-8"); } catch { /* ignore */ }
      return;
    }
    try {
      writeFileSync(path, JSON.stringify(this.state, null, 2) + "\n", "utf-8");
    } catch {
      // ignore
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}

function isTelegramRelayAutoConnectEnabled(): boolean {
  const settings = readLsdSettings();
  if (settings.telegramLiveRelayAutoConnect === true) return true;
  // Backward compatibility: honor legacy preference key if present.
  const rq = loadEffectivePreferences()?.preferences.remote_questions as { telegram_live_relay_auto_connect?: unknown } | undefined;
  return rq?.telegram_live_relay_auto_connect === true;
}

function setTelegramRelayAutoConnect(enabled: boolean): void {
  const current = readLsdSettings();
  current.telegramLiveRelayAutoConnect = enabled;
  writeLsdSettings(current);
}

function readLsdSettings(): Record<string, unknown> {
  const path = lsdSettingsPath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function writeLsdSettings(settings: Record<string, unknown>): void {
  const path = lsdSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

function lsdSettingsPath(): string {
  const lsdHome = process.env.LSD_HOME || process.env.GSD_HOME || join(homedir(), ".lsd");
  return join(lsdHome, "agent", "settings.json");
}

export function isTelegramLiveRelayConnected(): boolean {
  const path = relayStatePath();
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as RelayState | null;
    return !!parsed?.connected;
  } catch {
    return false;
  }
}

function relayStatePath(): string {
  return join(relayBasePath(), sessionKey(), "telegram-live.json");
}

function relayBasePath(): string {
  return join(process.env.LSD_HOME || join(homedir(), ".lsd"), "runtime", "relay");
}

function relayOwnerDir(): string {
  return join(relayBasePath(), "owners");
}

function relayOwnerPath(chatId: string): string {
  const safeChatId = chatId.replace(/[^\d-]/g, "_");
  return join(relayOwnerDir(), `telegram-${safeChatId}.json`);
}

function readRelayOwner(chatId: string): RelayOwnerRecord | null {
  const path = relayOwnerPath(chatId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RelayOwnerRecord;
  } catch {
    return null;
  }
}

function writeRelayOwner(owner: RelayOwnerRecord): void {
  const path = relayOwnerPath(owner.chatId);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(owner, null, 2) + "\n", "utf-8");
}

function removeRelayOwner(chatId: string): void {
  const path = relayOwnerPath(chatId);
  try {
    if (existsSync(path)) {
      writeFileSync(path, "null\n", "utf-8");
    }
  } catch {
    // ignore
  }
}

function sessionKey(): string {
  return createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12);
}

function fingerprint(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: string; text?: string } => typeof part === "object" && part !== null && "type" in part)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}

function chunkText(text: string, limit: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const chunks: string[] = [];
  let remaining = trimmed;
  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf("\n\n", limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = limit;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

function formatToolStart(toolName: string, args?: Record<string, unknown>): string {
  const detail = formatToolDetail(toolName, args);
  return detail ? `🔧 ${toolName} started\n${detail}` : `🔧 ${toolName} started`;
}

function formatToolEnd(
  toolName: string,
  args: Record<string, unknown> | undefined,
  result: unknown,
  isError: boolean,
): string {
  const status = isError ? "❌" : "✅";
  const suffix = formatToolEndSuffix(toolName, result);
  const detail = formatToolDetail(toolName, args);
  const header = `${status} ${toolName} finished${suffix}`;
  return detail ? `${header}\n${detail}` : header;
}

function formatToolEndSuffix(toolName: string, result: unknown): string {
  if (toolName !== "bash" || !result || typeof result !== "object") return "";
  const code = (result as { details?: { exitCode?: unknown } }).details?.exitCode;
  return typeof code === "number" ? ` (exit ${code})` : "";
}

function formatToolDetail(toolName: string, args?: Record<string, unknown>): string {
  if (!args) return "";

  if (toolName === "bash") {
    const command = typeof args.command === "string" ? args.command.trim() : "";
    return command ? `$ ${truncateLine(command, 500)}` : "";
  }

  if (toolName === "read" || toolName === "edit" || toolName === "write") {
    const path = typeof args.path === "string" ? args.path.trim() : "";
    return path ? truncateLine(path, 500) : "";
  }

  if (toolName === "lsp") {
    const action = typeof args.action === "string" ? args.action : "";
    const file = typeof args.file === "string" ? args.file : "";
    const query = typeof args.query === "string" ? args.query : "";
    const parts = [action, file, query].filter(Boolean);
    return parts.length > 0 ? truncateLine(parts.join(" · "), 500) : "";
  }

  if (toolName.startsWith("browser_")) {
    const selector = typeof args.selector === "string" ? args.selector : "";
    const url = typeof args.url === "string" ? args.url : "";
    const text = typeof args.text === "string" ? args.text : "";
    const parts = [url, selector, text ? `text=${text}` : ""].filter(Boolean);
    return parts.length > 0 ? truncateLine(parts.join(" · "), 500) : "";
  }

  return "";
}

function truncateLine(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
