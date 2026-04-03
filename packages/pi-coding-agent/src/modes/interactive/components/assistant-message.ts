import type { AssistantMessage } from "@gsd/pi-ai";
import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@gsd/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { formatTimestamp, type TimestampFormat } from "./timestamp.js";

/**
 * Component that renders a complete assistant message
 */
export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private hideThinkingBlock: boolean;
	private thinkingLevel: string;
	private markdownTheme: MarkdownTheme;
	private lastMessage?: AssistantMessage;
	private timestampFormat: TimestampFormat;

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
		timestampFormat: TimestampFormat = "date-time-iso",
		thinkingLevel = "off",
	) {
		super();

		this.hideThinkingBlock = hideThinkingBlock;
		this.thinkingLevel = thinkingLevel;
		this.markdownTheme = markdownTheme;
		this.timestampFormat = timestampFormat;

		// Container for text/thinking content
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		if (message) {
			this.updateContent(message);
		}
	}

	override invalidate(): void {
		super.invalidate();
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHideThinkingBlock(hide: boolean): void {
		this.hideThinkingBlock = hide;
	}

	setThinkingLevel(level: string): void {
		this.thinkingLevel = level;
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;

		// Clear content container
		this.contentContainer.clear();

		const hasVisibleContent = message.content.some((c) => {
			if (c.type === "text") return Boolean(c.text.trim());
			if (c.type === "thinking") return !this.hideThinkingBlock && Boolean(c.thinking.trim());
			return false;
		});

		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		// Render content in order
		let markerAdded = false;
		const responseMarker = `${theme.fg("accent", "●")} `;
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				// Assistant text messages with no background - trim the text
				// Set paddingY=0 to avoid extra spacing before tool executions
				const text = content.text.trim();
				const withMarker = markerAdded ? text : `${responseMarker}${text}`;
				this.contentContainer.addChild(new Markdown(withMarker, 1, 0, this.markdownTheme));
				markerAdded = true;
			} else if (content.type === "thinking" && content.thinking.trim()) {
				if (this.hideThinkingBlock) {
					// Hide thinking content entirely when hide-thinking is enabled.
					continue;
				}

				// Add spacing only when another visible assistant content block follows.
				// This avoids a superfluous blank line before separately-rendered tool execution blocks.
				const hasVisibleContentAfter = message.content.slice(i + 1).some((c) => {
					if (c.type === "text") return Boolean(c.text.trim());
					if (c.type === "thinking") return !this.hideThinkingBlock && Boolean(c.thinking.trim());
					return false;
				});

				// Thinking traces in thinkingText color, italic
				this.contentContainer.addChild(
					new Markdown(content.thinking.trim(), 1, 0, this.markdownTheme, {
						color: (text: string) => theme.fg("thinkingText", text),
						italic: true,
					}),
				);
				if (hasVisibleContentAfter) {
					this.contentContainer.addChild(new Spacer(1));
				}
			}
		}

		// Check if aborted - show after partial content
		// But only if there are no tool calls (tool execution components will show the error)
		const hasToolCalls = message.content.some((c) => c.type === "toolCall");
		if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				if (hasVisibleContent) {
					this.contentContainer.addChild(new Spacer(1));
				} else {
					this.contentContainer.addChild(new Spacer(1));
				}
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
			}
		}

		// Timestamp display removed
		// Show timestamp when the message is complete (has a stop reason)
		// if (message.stopReason && message.timestamp) {
		// 	const timeStr = formatTimestamp(message.timestamp, this.timestampFormat);
		// 	this.contentContainer.addChild(new Text(theme.fg("dim", timeStr), 1, 0));
		// }
	}
}
