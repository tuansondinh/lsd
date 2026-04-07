import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ExtensionSelectorComponent } from "../extension-selector.js";
import { initTheme } from "../../theme/theme.js";

initTheme("dark");

describe("ExtensionSelectorComponent", () => {
	it("supports multi-select with space toggle and enter confirm", () => {
		let received: string[] | string | undefined;
		const component = new ExtensionSelectorComponent(
			"Pick options",
			["Alpha", "Beta", "Gamma"],
			(selection) => {
				received = selection;
			},
			() => {
				throw new Error("did not expect cancel");
			},
			{ allowMultiple: true },
		);

		component.handleInput(" ");
		component.handleInput("j");
		component.handleInput(" ");
		component.handleInput("\n");

		assert.deepEqual(received, ["Alpha", "Beta"]);
	});

	it("keeps single-select behavior unchanged", () => {
		let received: string[] | string | undefined;
		const component = new ExtensionSelectorComponent(
			"Pick one",
			["Alpha", "Beta"],
			(selection) => {
				received = selection;
			},
			() => {
				throw new Error("did not expect cancel");
			},
		);

		component.handleInput("j");
		component.handleInput("\n");

		assert.equal(received, "Beta");
	});
});
