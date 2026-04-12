import type { AssistantMessage, Context, Message, Model, SimpleStreamOptions, StopReason, Usage } from "@gsd/pi-ai";
import { streamSimple } from "@gsd/pi-ai";
import {
    Input,
    Markdown,
    type MarkdownTheme,
    parseKey,
    truncateToWidth,
    type Component,
    type Focusable,
    type TUI,
    visibleWidth,
} from "@gsd/pi-tui";
import { theme } from "../theme/theme.js";

const EMPTY_USAGE: Usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
    },
};

interface BtwTurn {
    role: "user" | "assistant";
    text: string;
    isError?: boolean;
    isStreaming?: boolean;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function fitWidth(text: string, width: number): string {
    if (width <= 0) return "";
    const visible = visibleWidth(text);
    if (visible === width) return text;
    if (visible < width) return text + " ".repeat(width - visible);
    return truncateToWidth(text, width, "");
}

function formatAssistantError(message: AssistantMessage): string {
    if (message.errorMessage?.trim()) {
        return message.errorMessage.trim();
    }

    const text = message.content
        .map((part) => (part.type === "text" ? part.text.trim() : ""))
        .filter(Boolean)
        .join("\n")
        .trim();

    return text || `Request failed (${message.stopReason})`;
}

export class BtwOverlayComponent implements Component, Focusable {
    private _focused = false;

    private readonly markdownTheme: MarkdownTheme;
    private readonly model: Model<any>;
    private readonly systemPrompt: string | undefined;
    private readonly baseMessages: Message[];
    private readonly ui: TUI;
    private readonly input = new Input();
    private readonly onDismiss: () => void;
    private readonly requestRender: () => void;
    private readonly streamFn: typeof streamSimple;
    private readonly streamOptions: Pick<SimpleStreamOptions, "apiKey" | "sessionId">;

    private readonly btwHistory: Message[] = [];
    private readonly turns: BtwTurn[] = [];
    private currentAbortController: AbortController | undefined;
    private disposed = false;
    private isStreaming = false;
    private scrollOffset = 0;
    private followTail = true;
    private lastWidth = 0;

    get focused(): boolean {
        return this._focused;
    }

    set focused(value: boolean) {
        this._focused = value;
        this.input.focused = value;
    }

    constructor(
        question: string,
        model: Model<any>,
        systemPrompt: string | undefined,
        messages: Message[],
        markdownTheme: MarkdownTheme,
        ui: TUI,
        onDismiss: () => void,
        requestRender: () => void,
        streamer: typeof streamSimple = streamSimple,
        streamOptions: Pick<SimpleStreamOptions, "apiKey" | "sessionId"> = {},
    ) {
        this.model = model;
        this.systemPrompt = systemPrompt;
        this.baseMessages = messages;
        this.markdownTheme = markdownTheme;
        this.ui = ui;
        this.onDismiss = onDismiss;
        this.requestRender = requestRender;
        this.streamFn = streamer;
        this.streamOptions = streamOptions;

        this.input.placeholder = "Ask follow-up...";
        this.input.onEscape = () => this.dismiss();
        this.input.onSubmit = (value) => {
            void this.submitTurn(value);
        };

        void this.submitTurn(question);
    }

    handleInput(data: string): void {
        const key = parseKey(data);
        switch (key) {
            case "up":
                this.scrollBy(-1);
                return;
            case "down":
                this.scrollBy(1);
                return;
            case "pageUp":
                this.scrollBy(-(this.getBodyHeight() - 1));
                return;
            case "pageDown":
                this.scrollBy(this.getBodyHeight() - 1);
                return;
        }

        this.input.handleInput(data);
        if (!this.disposed) {
            this.requestRender();
        }
    }

    invalidate(): void {
        // No cached subtree state to invalidate.
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.currentAbortController?.abort();
    }

    render(width: number): string[] {
        this.lastWidth = width;

        const totalHeight = this.getTotalHeight();
        const bodyHeight = Math.max(1, totalHeight - 4);
        const contentWidth = Math.max(1, width - 4);
        const bodyLines = this.getBodyLines(contentWidth);
        const maxOffset = Math.max(0, bodyLines.length - bodyHeight);
        if (this.followTail) {
            this.scrollOffset = maxOffset;
        } else {
            this.scrollOffset = clamp(this.scrollOffset, 0, maxOffset);
        }

        const visibleBody = bodyLines.slice(this.scrollOffset, this.scrollOffset + bodyHeight);
        while (visibleBody.length < bodyHeight) {
            visibleBody.push("");
        }

        const inputLines = this.input.render(contentWidth);
        const inputLine = inputLines[0] ?? "";

        return [
            this.renderTopBorder(width),
            ...visibleBody.map((line) => this.renderBodyLine(line, width)),
            this.renderBodyLine(inputLine, width),
            this.renderFooterLine(width, bodyLines.length > bodyHeight),
            this.renderBottomBorder(width),
        ];
    }

    private dismiss(): void {
        this.dispose();
        this.onDismiss();
    }

    private async submitTurn(rawQuestion: string): Promise<void> {
        const question = rawQuestion.trim();
        if (!question || this.disposed || this.isStreaming) {
            return;
        }

        const userMessage = this.createUserMessage(question);
        const context: Context = {
            systemPrompt: this.systemPrompt,
            messages: [...this.baseMessages, ...this.btwHistory, userMessage],
        };

        this.btwHistory.push(userMessage);
        this.turns.push({ role: "user", text: question });
        const assistantTurn: BtwTurn = { role: "assistant", text: "", isStreaming: true };
        this.turns.push(assistantTurn);
        this.input.setValue("");
        this.isStreaming = true;
        this.followTail = true;
        this.requestRender();

        const abortController = new AbortController();
        this.currentAbortController = abortController;

        try {
            const eventStream = this.streamFn(this.model, context, {
                signal: abortController.signal,
                apiKey: this.streamOptions.apiKey,
                sessionId: this.streamOptions.sessionId,
            });

            for await (const event of eventStream) {
                if (this.disposed || this.currentAbortController !== abortController) {
                    break;
                }

                if (event.type === "text_delta") {
                    assistantTurn.text += event.delta;
                    this.requestRender();
                    continue;
                }

                if (event.type === "done") {
                    this.finishAssistantTurn(assistantTurn, "stop");
                    this.requestRender();
                    break;
                }

                if (event.type === "error") {
                    if (event.reason === "aborted") {
                        continue;
                    }

                    assistantTurn.isError = true;
                    if (!assistantTurn.text.trim()) {
                        assistantTurn.text = formatAssistantError(event.error);
                    }
                    this.finishAssistantTurn(assistantTurn, "error");
                    this.requestRender();
                    break;
                }
            }
        } catch (error: unknown) {
            if (this.disposed || abortController.signal.aborted || this.currentAbortController !== abortController) {
                return;
            }

            assistantTurn.isError = true;
            assistantTurn.text = error instanceof Error ? error.message : "Unknown error";
            this.finishAssistantTurn(assistantTurn, "error");
            this.requestRender();
        } finally {
            if (this.currentAbortController === abortController) {
                this.currentAbortController = undefined;
                this.isStreaming = false;
                assistantTurn.isStreaming = false;
                this.requestRender();
            }
        }
    }

    private finishAssistantTurn(turn: BtwTurn, stopReason: StopReason): void {
        turn.isStreaming = false;
        if (!turn.text.trim()) {
            return;
        }

        this.btwHistory.push({
            role: "assistant",
            content: [{ type: "text", text: turn.text }],
            api: this.model.api,
            provider: this.model.provider,
            model: this.model.id,
            usage: EMPTY_USAGE,
            stopReason,
            errorMessage: turn.isError ? turn.text : undefined,
            timestamp: Date.now(),
        });
    }

    private createUserMessage(question: string): Message {
        return {
            role: "user",
            content: [{ type: "text", text: question }],
            timestamp: Date.now(),
        };
    }

    private getTotalHeight(): number {
        return Math.max(6, Math.floor(this.ui.terminal.rows * 0.7));
    }

    private getBodyHeight(): number {
        return Math.max(1, this.getTotalHeight() - 4);
    }

    private scrollBy(delta: number): void {
        const bodyHeight = this.getBodyHeight();
        const bodyLines = this.getBodyLines(Math.max(1, this.lastWidth - 4));
        const maxOffset = Math.max(0, bodyLines.length - bodyHeight);
        this.scrollOffset = clamp(this.scrollOffset + delta, 0, maxOffset);
        this.followTail = this.scrollOffset >= maxOffset;
        this.requestRender();
    }

    private getBodyLines(contentWidth: number): string[] {
        const lines: string[] = [];

        for (const [index, turn] of this.turns.entries()) {
            if (index > 0) {
                lines.push("");
            }
            lines.push(turn.role === "user" ? theme.fg("accent", "You") : theme.fg("muted", "btw"));
            lines.push(...this.renderTurnContent(turn, Math.max(1, contentWidth - 2)).map((line) => `  ${line}`));
        }

        if (lines.length === 0) {
            lines.push(theme.fg("dim", "Awaiting response…"));
        }

        return lines;
    }

    private renderTurnContent(turn: BtwTurn, contentWidth: number): string[] {
        if (!turn.text.trim()) {
            return [theme.fg("dim", turn.isStreaming ? "Awaiting response…" : "No response received.")];
        }

        if (turn.isError) {
            return [theme.fg("error", `Error: ${turn.text}`)];
        }

        const markdown = new Markdown(turn.text, 0, 0, this.markdownTheme, {
            color: (text: string) => theme.fg("text", text),
        });
        return markdown.render(contentWidth);
    }

    private renderTopBorder(width: number): string {
        if (width <= 2) {
            return "┌┐".slice(0, width);
        }

        const innerWidth = width - 2;
        const title = theme.fg("accent", " btw ");
        const titleWidth = visibleWidth(title);

        if (innerWidth <= titleWidth) {
            return fitWidth(`┌${truncateToWidth(title, innerWidth, "")}┐`, width);
        }

        const dashCount = innerWidth - titleWidth;
        const leftDashes = Math.floor(dashCount / 2);
        const rightDashes = dashCount - leftDashes;
        const border = theme.fg("border", "─");
        return `┌${border.repeat(leftDashes)}${title}${border.repeat(rightDashes)}┐`;
    }

    private renderBottomBorder(width: number): string {
        if (width <= 2) {
            return "└┘".slice(0, width);
        }
        return `└${theme.fg("border", "─").repeat(width - 2)}┘`;
    }

    private renderBodyLine(text: string, width: number): string {
        const innerWidth = Math.max(1, width - 4);
        const fitted = fitWidth(truncateToWidth(text, innerWidth, ""), innerWidth);
        return fitWidth(`│ ${fitted} │`, width);
    }

    private renderFooterLine(width: number, canScroll: boolean): string {
        const innerWidth = Math.max(1, width - 4);
        const parts: string[] = ["Enter send", "Esc dismiss"];
        if (canScroll) {
            parts.push("↑↓/PgUp/PgDn scroll");
        }

        const status = this.isStreaming
            ? theme.fg("muted", "Streaming...")
            : theme.fg("success", "Ready");

        const footer = `${theme.fg("muted", parts.join(" • "))}  ${status}`;
        const fitted = fitWidth(truncateToWidth(footer, innerWidth, ""), innerWidth);
        return fitWidth(`│ ${fitted} │`, width);
    }
}
