import { Container, Markdown, type MarkdownTheme, Spacer } from "@gsd/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";

/**
 * Component that renders a user message with a visual prompt marker.
 */
export class UserMessageComponent extends Container {
	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme(), _timestamp?: number, _timestampFormat: string = "date-time-iso") {
		super();
		this.addChild(new Spacer(1));
		const promptMarker = `${theme.fg("accent", "▶")} `;
		this.addChild(
			new Markdown(`${promptMarker}${text}`, 1, 1, markdownTheme, {
				bgColor: (text: string) => theme.bg("userMessageBg", text),
				color: (text: string) => theme.fg("userMessageText", text),
			}),
		);
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) {
			return lines;
		}

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = lines[lines.length - 1] + OSC133_ZONE_END;
		return lines;
	}
}
