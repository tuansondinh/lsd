import type { AssistantMessage } from "@gsd/pi-ai";
import type { Component } from "@gsd/pi-tui";
import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@gsd/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";
import { formatTimestamp, type TimestampFormat } from "./timestamp.js";

/**
 * Create the response marker prefixed to the first visible text block.
 * Lazy to avoid calling theme.fg() at module load time (fails in tests).
 */
function getResponseMarker(): string {
	return `${theme.fg("accent", "●")} `;
}

/**
 * Create a Markdown component for an assistant text block.
 * @param text - Text content (should be trimmed by caller)
 * @param withMarker - Whether to prefix with the response marker
 * @param markdownTheme - Markdown theme
 */
export function createTextMarkdown(
	text: string,
	withMarker: boolean,
	markdownTheme: MarkdownTheme,
): Markdown {
	const withMarker_ = withMarker ? `${getResponseMarker()}${text}` : text;
	return new Markdown(withMarker_, 1, 0, markdownTheme);
}

/**
 * Create a Markdown component for a thinking block.
 */
export function createThinkingMarkdown(
	thinking: string,
	markdownTheme: MarkdownTheme,
): Markdown {
	return new Markdown(thinking.trim(), 1, 0, markdownTheme, {
		color: (text: string) => theme.fg("thinkingText", text),
		italic: true,
	});
}

/**
 * Create an error/abort Text component.
 */
export function createErrorText(message: string): Text {
	return new Text(theme.fg("error", message), 1, 0);
}

/**
 * Component that renders a complete assistant message.
 *
 * Supports two rendering modes:
 * 1. Legacy: `updateContent(message)` renders all text/thinking into a contentContainer.
 *    Tool rows are expected to be added as siblings in the parent container.
 * 2. Interleaved: `updateContentOrdered(message, toolComponents)` renders text/thinking
 *    AND tool components in content order. Tool components become children of this container.
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

	/**
	 * Legacy rendering: renders text/thinking blocks into contentContainer.
	 * Stops rendering at the first tool-type block (toolCall/serverToolUse).
	 * Post-tool text blocks are handled by the chat-controller to preserve
	 * content ordering relative to tool rows.
	 */
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

		// Render content blocks up to (but not including) the first tool block.
		// Text blocks after tools are rendered by the chat-controller as separate
		// components to maintain correct visual ordering with tool rows.
		let markerAdded = false;
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];

			// Stop at the first tool-type block — post-tool content is handled externally
			if (content.type === "toolCall" || content.type === "serverToolUse") {
				break;
			}

			if (content.type === "text" && content.text.trim()) {
				const text = content.text.trim();
				const withMarker = markerAdded ? text : `${getResponseMarker()}${text}`;
				this.contentContainer.addChild(new Markdown(withMarker, 1, 0, this.markdownTheme));
				markerAdded = true;
			} else if (content.type === "thinking" && content.thinking.trim()) {
				if (this.hideThinkingBlock) {
					continue;
				}

				const hasVisibleContentAfter = message.content.slice(i + 1).some((c) => {
					if (c.type === "text") return Boolean(c.text.trim());
					if (c.type === "thinking") return !this.hideThinkingBlock && Boolean(c.thinking.trim());
					return false;
				});

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
		const hasToolCalls = message.content.some((c) => c.type === "toolCall" || c.type === "serverToolUse");
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
	}

	/**
	 * Interleaved rendering: renders text/thinking AND tool components in content order.
	 * Tool components become children of this container, preserving visual ordering.
	 *
	 * @param message - The assistant message
	 * @param toolComponents - Map of content block ID → pre-created Component (ToolExecutionComponent etc.)
	 * @returns Map of content block ID → the tool Component that was placed (for pending tool tracking)
	 */
	updateContentOrdered(
		message: AssistantMessage,
		toolComponents?: Map<string, Component>,
	): Map<string, Component> {
		this.lastMessage = message;

		// Clear contentContainer so we can re-render all blocks in order
		this.contentContainer.clear();

		const placedTools = new Map<string, Component>();

		// Check if there's any visible content at all
		const hasVisibleContent = message.content.some((c) => {
			if (c.type === "text") return Boolean(c.text.trim());
			if (c.type === "thinking") return !this.hideThinkingBlock && Boolean(c.thinking.trim());
			return false;
		});

		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		// Render all content blocks in order
		let markerAdded = false;
		for (let i = 0; i < message.content.length; i++) {
			const block = message.content[i];

			if (block.type === "text" && block.text.trim()) {
				const text = block.text.trim();
				const withMarker = markerAdded ? text : `${getResponseMarker()}${text}`;
				this.contentContainer.addChild(new Markdown(withMarker, 1, 0, this.markdownTheme));
				markerAdded = true;
			} else if (block.type === "thinking" && block.thinking.trim()) {
				if (this.hideThinkingBlock) {
					continue;
				}

				// Add spacing only when another visible assistant content block follows.
				const hasVisibleContentAfter = message.content.slice(i + 1).some((c) => {
					if (c.type === "text") return Boolean(c.text.trim());
					if (c.type === "thinking") return !this.hideThinkingBlock && Boolean(c.thinking.trim());
					return false;
				});

				this.contentContainer.addChild(
					new Markdown(block.thinking.trim(), 1, 0, this.markdownTheme, {
						color: (text: string) => theme.fg("thinkingText", text),
						italic: true,
					}),
				);
				if (hasVisibleContentAfter) {
					this.contentContainer.addChild(new Spacer(1));
				}
			} else if ((block.type === "toolCall" || block.type === "serverToolUse") && toolComponents?.has(block.id)) {
				// Place the pre-created tool component in content order
				const toolComponent = toolComponents.get(block.id)!;
				this.contentContainer.addChild(toolComponent);
				placedTools.set(block.id, toolComponent);
			}
			// webSearchResult blocks don't produce their own component;
			// they update the matching serverToolUse component via updateResult()
		}

		// Handle abort/error after content (only if no tool calls)
		const hasToolCalls = message.content.some((c) => c.type === "toolCall" || c.type === "serverToolUse");
		if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
			}
		}

		return placedTools;
	}
}
