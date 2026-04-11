import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	registryGetActive,
	registryListPages,
	registrySetActive,
} from "../core.js";
import type { ToolDeps } from "../state.js";
import {
	getPageRegistry,
	getActiveFrame,
	setActiveFrame,
} from "../state.js";

export function registerPageTools(pi: ExtensionAPI, deps: ToolDeps): void {
	// -------------------------------------------------------------------------
	// browser_pages — list, switch, close tabs
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_pages",
		label: "Browser Pages",
		description:
			"Manage browser tabs: list open pages, switch to a page by ID, or close a page by ID. " +
			"Cannot close the last remaining page — use browser_close for that.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("list"),
				Type.Literal("switch"),
				Type.Literal("close"),
			], { description: "'list' — show all pages, 'switch' — activate a page by ID, 'close' — close a page by ID" }),
			id: Type.Optional(Type.Number({ description: "Page ID (required for switch/close, from list action)." })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				await deps.ensureBrowser();

				if (params.action === "list") {
					return await listPages();
				} else if (params.action === "switch") {
					if (!params.id) return { content: [{ type: "text" as const, text: "Switch requires 'id' parameter." }], details: { error: "missing_id" }, isError: true };
					return await switchPage(params.id);
				} else {
					if (!params.id) return { content: [{ type: "text" as const, text: "Close requires 'id' parameter." }], details: { error: "missing_id" }, isError: true };
					return await closePage(params.id);
				}
			} catch (err: any) {
				return {
					content: [{ type: "text" as const, text: `Pages action '${params.action}' failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});

	// -------------------------------------------------------------------------
	// browser_frames — list and select iframes
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_frames",
		label: "Browser Frames",
		description:
			"Manage browser frames (iframes): list all frames in the active page, or select a frame to operate on. " +
			"Pass action='select' with name, urlPattern, or index. Use name='main' to reset to main page.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("list"),
				Type.Literal("select"),
			], { description: "'list' — show all frames, 'select' — activate a frame" }),
			name: Type.Optional(Type.String({ description: "Frame name to select. Use 'main' to reset to main frame." })),
			urlPattern: Type.Optional(Type.String({ description: "URL substring to match for frame selection." })),
			index: Type.Optional(Type.Number({ description: "Frame index from list action." })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				await deps.ensureBrowser();

				if (params.action === "list") {
					return await listFrames();
				} else {
					return await selectFrame(params);
				}
			} catch (err: any) {
				return {
					content: [{ type: "text" as const, text: `Frames action '${params.action}' failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});

	// ── page helpers ──

	async function listPages() {
		const pageRegistry = getPageRegistry();
		for (const entry of pageRegistry.pages) {
			try {
				entry.title = await entry.page.title();
				entry.url = entry.page.url();
			} catch { /* Page may have been closed */ }
		}
		const pages = registryListPages(pageRegistry);
		if (pages.length === 0) {
			return { content: [{ type: "text" as const, text: "No pages open." }], details: { pages: [], count: 0 } };
		}
		const lines = pages.map((p: any) => {
			const active = p.isActive ? " ← active" : "";
			const opener = p.opener !== null ? ` (opener: ${p.opener})` : "";
			return `  [${p.id}] ${p.title || "(untitled)"} — ${p.url}${opener}${active}`;
		});
		return {
			content: [{ type: "text" as const, text: `${pages.length} page(s):\n${lines.join("\n")}` }],
			details: { pages, count: pages.length },
		};
	}

	async function switchPage(id: number) {
		const pageRegistry = getPageRegistry();
		registrySetActive(pageRegistry, id);
		setActiveFrame(null);
		const entry = registryGetActive(pageRegistry);
		await entry.page.bringToFront();
		const title = await entry.page.title().catch(() => "");
		const url = entry.page.url();
		entry.title = title;
		entry.url = url;
		return {
			content: [{ type: "text" as const, text: `Switched to page ${id}: ${title || "(untitled)"} — ${url}` }],
			details: { id, title, url },
		};
	}

	async function closePage(id: number) {
		const pageRegistry = getPageRegistry();
		if (pageRegistry.pages.length <= 1) {
			return {
				content: [{ type: "text" as const, text: "Cannot close the last remaining page. Use browser_close to close the entire browser." }],
				details: { error: "last_page", pageCount: pageRegistry.pages.length },
				isError: true,
			};
		}
		const entry = pageRegistry.pages.find((e: any) => e.id === id);
		if (!entry) {
			const available = pageRegistry.pages.map((e: any) => e.id);
			return {
				content: [{ type: "text" as const, text: `Page ${id} not found. Available page IDs: [${available.join(", ")}].` }],
				details: { error: "not_found", available },
				isError: true,
			};
		}
		await entry.page.close();
		setActiveFrame(null);
		for (const remaining of pageRegistry.pages) {
			try {
				remaining.title = await remaining.page.title();
				remaining.url = remaining.page.url();
			} catch { /* non-fatal */ }
		}
		const pages = registryListPages(pageRegistry);
		const lines = pages.map((p: any) => {
			const active = p.isActive ? " ← active" : "";
			return `  [${p.id}] ${p.title || "(untitled)"} — ${p.url}${active}`;
		});
		return {
			content: [{ type: "text" as const, text: `Closed page ${id}. ${pages.length} page(s) remaining:\n${lines.join("\n")}` }],
			details: { closedId: id, pages, count: pages.length },
		};
	}

	// ── frame helpers ──

	async function listFrames() {
		const p = deps.getActivePage();
		const frames = p.frames();
		const mainFrame = p.mainFrame();
		const activeFrame = getActiveFrame();
		const frameList = frames.map((f, index) => {
			const isMain = f === mainFrame;
			const parentName = f.parentFrame()?.name() || (f.parentFrame() === mainFrame ? "main" : "");
			return {
				index,
				name: f.name() || (isMain ? "main" : `(unnamed-${index})`),
				url: f.url(),
				isMain,
				parentName: isMain ? null : (parentName || "main"),
				isActive: f === activeFrame,
			};
		});
		const lines = frameList.map((f) => {
			const main = f.isMain ? " [main]" : "";
			const active = f.isActive ? " ← selected" : "";
			const parent = f.parentName ? ` (parent: ${f.parentName})` : "";
			return `  [${f.index}] "${f.name}" — ${f.url}${main}${parent}${active}`;
		});
		const activeInfo = activeFrame ? `Active frame: "${activeFrame.name() || "(unnamed)"}"` : "No frame selected (operating on main page)";
		return {
			content: [{ type: "text" as const, text: `${frameList.length} frame(s) in active page:\n${lines.join("\n")}\n\n${activeInfo}` }],
			details: { frames: frameList, count: frameList.length, activeFrame: activeFrame?.name() ?? null },
		};
	}

	async function selectFrame(params: { name?: string; urlPattern?: string; index?: number }) {
		const p = deps.getActivePage();
		const frames = p.frames();

		if (params.name === "main" || params.name === "null" || params.name === null) {
			setActiveFrame(null);
			return { content: [{ type: "text" as const, text: "Reset to main page frame." }], details: { activeFrame: null } };
		}

		if (params.name) {
			const frame = frames.find((f) => f.name() === params.name);
			if (!frame) {
				const available = frames.map((f, i) => `[${i}] "${f.name() || "(unnamed)"}" — ${f.url()}`);
				return { content: [{ type: "text" as const, text: `Frame "${params.name}" not found.\n${available.join("\n  ")}` }], details: { error: "not_found" }, isError: true };
			}
			setActiveFrame(frame);
			return { content: [{ type: "text" as const, text: `Selected frame "${frame.name()}" — ${frame.url()}` }], details: { name: frame.name(), url: frame.url() } };
		}

		if (params.urlPattern) {
			const frame = frames.find((f) => f.url().includes(params.urlPattern!));
			if (!frame) {
				const available = frames.map((f, i) => `[${i}] "${f.name() || "(unnamed)"}" — ${f.url()}`);
				return { content: [{ type: "text" as const, text: `No frame URL matches "${params.urlPattern}".\n${available.join("\n  ")}` }], details: { error: "not_found" }, isError: true };
			}
			setActiveFrame(frame);
			return { content: [{ type: "text" as const, text: `Selected frame "${frame.name() || "(unnamed)"}" — ${frame.url()}` }], details: { name: frame.name(), url: frame.url() } };
		}

		if (params.index !== undefined) {
			if (params.index < 0 || params.index >= frames.length) {
				return { content: [{ type: "text" as const, text: `Frame index ${params.index} out of range (0-${frames.length - 1}).` }], details: { error: "index_out_of_range" }, isError: true };
			}
			const frame = frames[params.index];
			setActiveFrame(frame);
			return { content: [{ type: "text" as const, text: `Selected frame [${params.index}] "${frame.name() || "(unnamed)"}" — ${frame.url()}` }], details: { index: params.index, name: frame.name(), url: frame.url() } };
		}

		return {
			content: [{ type: "text" as const, text: "Provide name, urlPattern, or index to select a frame. Use name='main' to reset." }],
			details: { error: "no_criteria" },
			isError: true,
		};
	}
}
