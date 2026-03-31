type ResettableStdin = Pick<NodeJS.ReadStream, "removeAllListeners" | "pause"> & {
	setRawMode?: (mode: boolean) => void;
};

/**
 * Reset stdin after external prompt libraries temporarily take over the terminal.
 *
 * Clack/readline can leave keypress/data/readable listeners attached and stdin
 * in readable mode. Clear those hooks so the TUI can reclaim stdin cleanly.
 */
export function resetStdinForTui(stdin: ResettableStdin = process.stdin): void {
	stdin.removeAllListeners("data");
	stdin.removeAllListeners("keypress");
	stdin.removeAllListeners("readable");
	if (stdin.setRawMode) stdin.setRawMode(false);
	stdin.pause();
}
