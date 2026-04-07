/**
 * Generic selector component for extensions.
 * Displays a list of string options with keyboard navigation.
 * Options starting with SEPARATOR_PREFIX are rendered as non-selectable group headers.
 */

import { Container, getEditorKeybindings, Spacer, Text, type TUI } from "@gsd/pi-tui";
import { theme } from "../theme/theme.js";
import { CountdownTimer } from "./countdown-timer.js";
import { DynamicBorder } from "./dynamic-border.js";
import { keyHint, rawKeyHint } from "./keybinding-hints.js";

/** Prefix that marks an option as a non-selectable group header. */
export const SEPARATOR_PREFIX = "───";

export interface ExtensionSelectorOptions {
	tui?: TUI;
	timeout?: number;
	allowMultiple?: boolean;
}

export class ExtensionSelectorComponent extends Container {
	private options: string[];
	private selectedIndex = 0;
	private selectedValues = new Set<number>();
	private listContainer: Container;
	private onSelectCallback: (option: string | string[]) => void;
	private onCancelCallback: () => void;
	private titleText: Text;
	private baseTitle: string;
	private countdown: CountdownTimer | undefined;
	private readonly allowMultiple: boolean;

	constructor(
		title: string,
		options: string[],
		onSelect: (option: string | string[]) => void,
		onCancel: () => void,
		opts?: ExtensionSelectorOptions,
	) {
		super();

		this.options = options;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;
		this.baseTitle = title;
		this.allowMultiple = opts?.allowMultiple ?? false;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		this.titleText = new Text(theme.fg("accent", title), 1, 0);
		this.addChild(this.titleText);
		this.addChild(new Spacer(1));

		if (opts?.timeout && opts.timeout > 0 && opts.tui) {
			this.countdown = new CountdownTimer(
				opts.timeout,
				opts.tui,
				(s) => this.titleText.setText(theme.fg("accent", `${this.baseTitle} (${s}s)`)),
				() => this.onCancelCallback(),
			);
		}

		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				rawKeyHint("↑↓", "navigate") +
					"  " +
					(this.allowMultiple ? rawKeyHint("space", "toggle") + "  " : "") +
					keyHint("selectConfirm", this.allowMultiple ? "confirm" : "select") +
					"  " +
					keyHint("selectCancel", "cancel"),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		// Start on the first selectable (non-separator) item
		this.selectedIndex = this.nextSelectable(0, 1);
		this.updateList();
	}

	private isSeparator(index: number): boolean {
		return this.options[index]?.startsWith(SEPARATOR_PREFIX) ?? false;
	}

	/**
	 * Find the next selectable index starting from `from` in the given direction.
	 * Returns `from` clamped to bounds if nothing selectable is found.
	 */
	private nextSelectable(from: number, direction: 1 | -1): number {
		let idx = from;
		while (idx >= 0 && idx < this.options.length && this.isSeparator(idx)) {
			idx += direction;
		}
		if (idx < 0 || idx >= this.options.length) {
			return Math.max(0, Math.min(from, this.options.length - 1));
		}
		return idx;
	}

	private toggleSelected(index: number): void {
		if (this.isSeparator(index)) return;
		if (this.selectedValues.has(index)) this.selectedValues.delete(index);
		else this.selectedValues.add(index);
	}

	private getSelectedOptions(): string[] {
		return [...this.selectedValues]
			.sort((a, b) => a - b)
			.map((index) => this.options[index])
			.filter((option): option is string => typeof option === "string");
	}

	private updateList(): void {
		this.listContainer.clear();
		for (let i = 0; i < this.options.length; i++) {
			const option = this.options[i];
			if (this.isSeparator(i)) {
				this.listContainer.addChild(new Text(theme.fg("borderAccent", `  ${option}`), 1, 0));
				continue;
			}
			const isSelected = i === this.selectedIndex;
			const isChecked = this.selectedValues.has(i);
			const prefix = this.allowMultiple ? `[${isChecked ? "x" : " "}] ` : isSelected ? "→ " : "  ";
			const text = isSelected
				? theme.fg("accent", prefix) + theme.fg("accent", option)
				: `${prefix}${theme.fg("text", option)}`;
			this.listContainer.addChild(new Text(text, 1, 0));
		}
	}

	handleInput(keyData: string): void {
		const kb = getEditorKeybindings();
		if (kb.matches(keyData, "selectUp") || keyData === "k") {
			let next = this.selectedIndex - 1;
			if (next < 0) next = this.options.length - 1;
			next = this.nextSelectable(next, -1);
			if (this.isSeparator(next)) {
				next = this.nextSelectable(this.options.length - 1, -1);
			}
			this.selectedIndex = next;
			this.updateList();
		} else if (kb.matches(keyData, "selectDown") || keyData === "j") {
			let next = this.selectedIndex + 1;
			if (next >= this.options.length) next = 0;
			next = this.nextSelectable(next, 1);
			if (this.isSeparator(next)) {
				next = this.nextSelectable(0, 1);
			}
			this.selectedIndex = next;
			this.updateList();
		} else if (this.allowMultiple && keyData === " ") {
			this.toggleSelected(this.selectedIndex);
			this.updateList();
		} else if (kb.matches(keyData, "selectConfirm") || keyData === "\n") {
			const selected = this.options[this.selectedIndex];
			if (!selected || this.isSeparator(this.selectedIndex)) {
				return;
			}
			if (this.allowMultiple) {
				if (this.selectedValues.size === 0) {
					this.toggleSelected(this.selectedIndex);
				}
				this.onSelectCallback(this.getSelectedOptions());
				return;
			}
			this.onSelectCallback(selected);
		} else if (kb.matches(keyData, "selectCancel")) {
			this.onCancelCallback();
		}
	}

	dispose(): void {
		this.countdown?.dispose();
	}
}
