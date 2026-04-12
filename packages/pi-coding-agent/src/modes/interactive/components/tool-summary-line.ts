import { Container, Text } from "@gsd/pi-tui";

import { theme } from "../theme/theme.js";

interface CollapsedTool {
	name: string;
	elapsed: number;
}

export class ToolSummaryLine extends Container {
	private tools: CollapsedTool[] = [];
	private hidden = false;
	private contentText: Text;

	constructor() {
		super();
		this.contentText = new Text("", 1, 0);
		this.addChild(this.contentText);
	}

	addTool(name: string, elapsed: number): void {
		this.tools.push({ name, elapsed });
		this.updateDisplay();
	}

	setHidden(hidden: boolean): void {
		this.hidden = hidden;
	}

	override invalidate(): void {
		super.invalidate();
		this.updateDisplay();
	}

	override render(width: number): string[] {
		if (this.hidden || this.tools.length === 0) {
			return [];
		}
		return super.render(width);
	}

	private updateDisplay(): void {
		if (this.tools.length === 0) {
			this.contentText.setText("");
			return;
		}

		const counts = new Map<string, number>();
		let totalElapsed = 0;
		for (const tool of this.tools) {
			counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1);
			totalElapsed += tool.elapsed;
		}

		const groupedTools = [...counts.entries()]
			.map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
			.join(" · ");
		const elapsed = (totalElapsed / 1000).toFixed(1);
		const indicator = theme.fg("success", "●");
		const title = theme.fg("toolTitle", theme.bold("collapsed tools"));
		const details = theme.fg("muted", `${groupedTools} · ${elapsed}s`);
		this.contentText.setText(`${indicator} ${title} ${details}`);
	}
}
