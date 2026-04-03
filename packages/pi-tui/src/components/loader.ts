import type { TUI } from "../tui.js";
import { Text } from "./text.js";

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const ESC = "\x1b[";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

/** 24-bit foreground color */
function rgb(r: number, g: number, b: number, s: string): string {
	return `${ESC}38;2;${r};${g};${b}m${s}${RESET}`;
}

/** Interpolate between two RGB colors at position t ∈ [0,1] */
function lerpColor(
	r1: number, g1: number, b1: number,
	r2: number, g2: number, b2: number,
	t: number,
): [number, number, number] {
	return [
		Math.round(r1 + (r2 - r1) * t),
		Math.round(g1 + (g2 - g1) * t),
		Math.round(b1 + (b2 - b1) * t),
	];
}

// ─── Timing constants ─────────────────────────────────────────────────────────

const TYPING_SPEED = 55;   // ms per character typed
const HOLD_TIME    = 5000; // ms to hold the full word
const ERASE_SPEED  = 35;   // ms per character erased

// ─── Phase type ───────────────────────────────────────────────────────────────

type Phase = "typing" | "hold" | "erase";

/**
 * Loader component — braille spinner + animated word cycling.
 *
 * Each word types in character by character (typewriter), holds with a moving
 * blue→cyan shimmer gradient, then erases right-to-left before the next word.
 */
export class Loader extends Text {
	// ── spinner ───────────────────────────────────────────────────────────────
	private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private currentFrame = 0;
	private spinnerIntervalId: NodeJS.Timeout | null = null;
	private ui: TUI | null = null;

	// ── message state ─────────────────────────────────────────────────────────
	private message: string = "";

	// ── word animation ────────────────────────────────────────────────────────
	private cycleMessages: string[] | null = null;
	private cycleIndex = 0;
	private phase: Phase = "typing";
	private visibleChars = 0;
	private wordAnimId: NodeJS.Timeout | null = null;

	// ── shimmer gradient: theme blueHigh → blueXhigh ─────────────────────────
	private readonly gradStart: [number, number, number] = [147, 197, 253]; // #93c5fd (blue-300)
	private readonly gradEnd:   [number, number, number] = [191, 219, 254]; // #bfdbfe (blue-200)

	// Shimmer ticks independently at ~40ms for smooth gradient movement
	private shimmerTick = 0;
	private shimmerIntervalId: NodeJS.Timeout | null = null;

	constructor(
		ui: TUI,
		private spinnerColorFn: (str: string) => string,
		private _messageColorFn: (str: string) => string,
		message: string = "Loading…",
	) {
		super("", 1, 0);
		this.ui = ui;
		this.message = message;
		this.start();
	}

	render(width: number): string[] {
		return ["", ...super.render(width)];
	}

	// ── public API ────────────────────────────────────────────────────────────

	setCycleMessages(messages: string[], _intervalMs = 3000) {
		this.cycleMessages = [...messages];
		this.cycleIndex = 0;
		this.message = this.cycleMessages[0];
		if (this.spinnerIntervalId) {
			this.startWordAnimation();
		}
		this.updateDisplay();
	}

	clearCycleMessages() {
		this.stopWordAnimation();
		this.cycleMessages = null;
	}

	setMessage(message: string) {
		// When an explicit message is set externally (e.g. "Waiting for approval…"),
		// pause the cycle so it doesn't immediately overwrite the override.
		this.stopWordAnimation();
		this.cycleMessages = null;
		this.message = message;
		this.updateDisplay();
	}

	resumeCycle() {
		if (this.cycleMessages && !this.wordAnimId) {
			this.startWordAnimation();
		}
	}

	start() {
		if (this.spinnerIntervalId) clearInterval(this.spinnerIntervalId);
		this.spinnerIntervalId = setInterval(() => {
			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
			this.updateDisplay();
		}, 80);

		// Shimmer ticks independently at ~40ms for smooth gradient movement
		if (this.shimmerIntervalId) clearInterval(this.shimmerIntervalId);
		this.shimmerIntervalId = setInterval(() => {
			this.shimmerTick++;
			if (this.cycleMessages) this.updateDisplay();
		}, 40);

		if (this.cycleMessages) {
			this.startWordAnimation();
		} else {
			this.updateDisplay();
		}
	}

	stop() {
		if (this.spinnerIntervalId) { clearInterval(this.spinnerIntervalId); this.spinnerIntervalId = null; }
		if (this.shimmerIntervalId) { clearInterval(this.shimmerIntervalId); this.shimmerIntervalId = null; }
		this.stopWordAnimation();
	}

	dispose() {
		this.stop();
		this.ui = null;
	}

	// ── word animation internals ──────────────────────────────────────────────

	private startWordAnimation() {
		this.stopWordAnimation();
		this.phase = "typing";
		this.visibleChars = 0;
		this.scheduleWordTick();
	}

	private stopWordAnimation() {
		if (this.wordAnimId) { clearTimeout(this.wordAnimId); this.wordAnimId = null; }
	}

	private scheduleWordTick() {
		const word = this.currentWord();

		if (this.phase === "typing") {
			if (this.visibleChars < word.length) {
				this.wordAnimId = setTimeout(() => {
					this.visibleChars++;
					this.updateDisplay();
					this.scheduleWordTick();
				}, TYPING_SPEED);
			} else {
				// Full word shown → hold
				this.phase = "hold";
				this.wordAnimId = setTimeout(() => {
					this.phase = "erase";
					this.scheduleWordTick();
				}, HOLD_TIME);
			}
		} else if (this.phase === "erase") {
			if (this.visibleChars > 0) {
				this.wordAnimId = setTimeout(() => {
					this.visibleChars--;
					this.updateDisplay();
					this.scheduleWordTick();
				}, ERASE_SPEED);
			} else {
				// Advance to next word
				if (this.cycleMessages) {
					this.cycleIndex = (this.cycleIndex + 1) % this.cycleMessages.length;
					this.message = this.cycleMessages[this.cycleIndex];
				}
				this.phase = "typing";
				this.scheduleWordTick();
			}
		}
	}

	private currentWord(): string {
		return this.message;
	}

	// ── rendering ─────────────────────────────────────────────────────────────

	private renderAnimatedWord(): string {
		const word = this.currentWord();
		const visible = word.slice(0, this.visibleChars);
		if (!visible) return DIM + " " + RESET;

		// Each char gets a colour position that travels through the gradient.
		// The "wave" offset shifts every shimmerTick for a moving shimmer.
		let out = "";
		for (let i = 0; i < visible.length; i++) {
			const wave = (i / Math.max(word.length - 1, 1));
			// Slow rightward drift
			const drift = (this.shimmerTick * 0.025) % 1;
			const t = ((wave + drift) % 1);
			const [r, g, b] = lerpColor(...this.gradStart, ...this.gradEnd, t);

			// Last char being typed gets a bright flash
			const isEdge = (this.phase === "typing" && i === visible.length - 1);
			const char = isEdge
				? `${BOLD}${rgb(255, 255, 255, visible[i])}`
				: rgb(r, g, b, visible[i]);
			out += char;
		}
		return out;
	}

	private updateDisplay() {
		const frame = this.frames[this.currentFrame];
		const spinner = this.spinnerColorFn(frame);
		const text = this.cycleMessages
			? this.renderAnimatedWord()
			: this._messageColorFn(this.message);
		this.setText(`${spinner} ${text}`);
		if (this.ui) this.ui.requestRender();
	}
}
