import xtermPkg from "@xterm/headless";

const { Terminal } = xtermPkg;

export type HeadlessTerminal = InstanceType<typeof Terminal>;

export function createHeadlessTerminal(cols = 80, rows = 24, scrollback = 5000): HeadlessTerminal {
	return new Terminal({
		cols: Math.max(20, cols),
		rows: Math.max(5, rows),
		scrollback,
		allowProposedApi: true,
	});
}

function findLastContentLine(terminal: HeadlessTerminal, startLine = 0): number {
	const buffer = terminal.buffer.active;
	for (let i = buffer.length - 1; i >= startLine; i--) {
		const line = buffer.getLine(i);
		if (line && line.translateToString(true).length > 0) {
			return i;
		}
	}
	return -1;
}

function collectTerminalLines(terminal: HeadlessTerminal, startLine: number, endLineInclusive: number): string[] {
	const buffer = terminal.buffer.active;
	if (endLineInclusive < startLine) return [];

	const lines: string[] = [];
	for (let i = startLine; i <= endLineInclusive; i++) {
		const line = buffer.getLine(i);
		if (!line) {
			lines.push("");
			continue;
		}

		let trimRight = true;
		if (i + 1 <= endLineInclusive) {
			const nextLine = buffer.getLine(i + 1);
			if (nextLine?.isWrapped) {
				trimRight = false;
			}
		}

		const lineContent = line.translateToString(trimRight);
		if (line.isWrapped && lines.length > 0) {
			lines[lines.length - 1] += lineContent;
		} else {
			lines.push(lineContent);
		}
	}

	return lines;
}

export function snapshotTerminalLines(terminal: HeadlessTerminal, startLine = 0): string[] {
	const lastContentLine = findLastContentLine(terminal, startLine);
	if (lastContentLine < startLine) return [];
	return collectTerminalLines(terminal, startLine, lastContentLine);
}

export function snapshotTerminalViewport(terminal: HeadlessTerminal): string[] {
	const buffer = terminal.buffer.active;
	const start = buffer.viewportY;
	const end = Math.max(start, start + terminal.rows - 1);
	return collectTerminalLines(terminal, start, end);
}

export function snapshotTerminalViewportText(terminal: HeadlessTerminal): string {
	return snapshotTerminalViewport(terminal).join("\n").replace(/[ \t]+$/gmu, "");
}

export function snapshotTerminalBufferText(terminal: HeadlessTerminal): string {
	return snapshotTerminalLines(terminal).join("\n");
}
