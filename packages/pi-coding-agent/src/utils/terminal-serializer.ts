import stripAnsi from "strip-ansi";

function finalizeLine(cells: string[]): string {
	return cells.join("").replace(/[ \t]+$/u, "");
}

/**
 * Convert terminal-style output into stable display lines.
 * Handles ANSI stripping plus carriage-return overwrites and backspaces.
 */
export function renderTerminalLines(text: string): string[] {
	const stripped = stripAnsi(text).replace(/\r\n/g, "\n");
	const lines: string[] = [];
	let cells: string[] = [];
	let col = 0;

	const flushLine = () => {
		lines.push(finalizeLine(cells));
		cells = [];
		col = 0;
	};

	for (let i = 0; i < stripped.length; i++) {
		const ch = stripped[i]!;

		if (ch === "\n") {
			flushLine();
			continue;
		}

		if (ch === "\r") {
			col = 0;
			continue;
		}

		if (ch === "\b") {
			col = Math.max(0, col - 1);
			if (col < cells.length) cells[col] = " ";
			continue;
		}

		if (ch < " " && ch !== "\t") {
			continue;
		}

		if (ch === "\t") {
			const spaces = 4 - (col % 4 || 0);
			for (let s = 0; s < spaces; s++) {
				while (cells.length < col) cells.push(" ");
				if (col < cells.length) cells[col] = " ";
				else cells.push(" ");
				col++;
			}
			continue;
		}

		while (cells.length < col) cells.push(" ");
		if (col < cells.length) cells[col] = ch;
		else cells.push(ch);
		col++;
	}

	if (cells.length > 0 || stripped.endsWith("\n")) {
		lines.push(finalizeLine(cells));
	}

	return lines;
}

export function renderTerminalText(text: string): string {
	return renderTerminalLines(text).join("\n");
}
