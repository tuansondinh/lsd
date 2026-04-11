import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	diffCompactStates,
} from "../core.js";
import type { ToolDeps, CompactPageState } from "../state.js";
import {
	setLastActionBeforeState,
	setLastActionAfterState,
} from "../state.js";

export function registerNavigationTools(pi: ExtensionAPI, deps: ToolDeps): void {
	// -------------------------------------------------------------------------
	// browser_navigate
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_navigate",
		label: "Browser Navigate",
		description:
			"Navigate to a URL, go back/forward in history, or reload the page. " +
			"Use ONLY for locally-running web apps (e.g. http://localhost:3000). " +
			"Do NOT use for documentation sites, GitHub, or external URLs — use web_search instead.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("goto"),
				Type.Literal("go_back"),
				Type.Literal("go_forward"),
				Type.Literal("reload"),
			], { description: "'goto' — navigate to url (default), 'go_back'/'go_forward' — history, 'reload' — refresh page" }),
			url: Type.Optional(Type.String({ description: "URL to navigate to (required for goto action)." })),
			screenshot: Type.Optional(Type.Boolean({ description: "Capture and return a screenshot (default: false)", default: false })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const action = params.action ?? "goto";

			try {
				if (action === "goto") {
					return await gotoAction(params);
				} else if (action === "go_back") {
					return await goBackForward("back");
				} else if (action === "go_forward") {
					return await goBackForward("forward");
				} else {
					return await reloadAction();
				}
			} catch (err: any) {
				const errorShot = await deps.captureErrorScreenshot(deps.getActivePageOrNull());
				const content: any[] = [{ type: "text" as const, text: `Navigation '${action}' failed: ${err.message}` }];
				if (errorShot) content.push({ type: "image" as const, data: errorShot.data, mimeType: errorShot.mimeType });
				return { content, details: { error: err.message }, isError: true };
			}
		},
	});

	// ── action implementations ──

	async function gotoAction(params: { url?: string; screenshot?: boolean }) {
		if (!params.url) {
			return { content: [{ type: "text" as const, text: "Goto requires a 'url' parameter." }], details: { error: "missing_url" }, isError: true };
		}
		let actionId: number | null = null;
		let beforeState: CompactPageState | null = null;
		const { page: p } = await deps.ensureBrowser();
		beforeState = await deps.captureCompactPageState(p, { includeBodyText: true });
		actionId = deps.beginTrackedAction("browser_navigate", params, beforeState.url).id;
		await p.goto(params.url, { waitUntil: "domcontentloaded", timeout: 30000 });
		await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => { /* non-fatal */ });
		await new Promise(resolve => setTimeout(resolve, 300));

		const title = await p.title();
		const url = p.url();
		const viewport = p.viewportSize();
		const vpText = viewport ? `${viewport.width}x${viewport.height}` : "unknown";
		const afterState = await deps.captureCompactPageState(p, { includeBodyText: true });
		const summary = deps.formatCompactStateSummary(afterState);
		const jsErrors = deps.getRecentErrors(p.url());
		const diff = diffCompactStates(beforeState, afterState);
		setLastActionBeforeState(beforeState);
		setLastActionAfterState(afterState);
		deps.finishTrackedAction(actionId, {
			status: "success", afterUrl: afterState.url, warningSummary: jsErrors.trim() || undefined,
			diffSummary: diff.summary, changed: diff.changed, beforeState, afterState,
		});

		let screenshotContent: any[] = [];
		if (params.screenshot) {
			try {
				let buf = await p.screenshot({ type: "jpeg", quality: 80, scale: "css" });
				buf = await deps.constrainScreenshot(p, buf, "image/jpeg", 80);
				screenshotContent = [{ type: "image" as const, data: buf.toString("base64"), mimeType: "image/jpeg" }];
			} catch { /* non-fatal */ }
		}

		return {
			content: [
				{ type: "text" as const, text: `Navigated to: ${url}\nTitle: ${title}\nViewport: ${vpText}\nAction: ${actionId}${jsErrors}\n\nDiff:\n${deps.formatDiffText(diff)}\n\nPage summary:\n${summary}` },
				...screenshotContent,
			],
			details: { title, url, status: "loaded", viewport: vpText, actionId, diff },
		};
	}

	async function goBackForward(direction: "back" | "forward") {
		const { page: p } = await deps.ensureBrowser();
		const response = direction === "back"
			? await p.goBack({ waitUntil: "domcontentloaded", timeout: 10000 })
			: await p.goForward({ waitUntil: "domcontentloaded", timeout: 10000 });

		if (!response) {
			return {
				content: [{ type: "text" as const, text: `No ${direction} page in history.` }],
				details: {},
				isError: true,
			};
		}

		await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => { /* non-fatal */ });
		const title = await p.title();
		const url = p.url();
		const summary = await deps.postActionSummary(p);
		const jsErrors = deps.getRecentErrors(p.url());

		return {
			content: [{ type: "text" as const, text: `Navigated ${direction} to: ${url}\nTitle: ${title}${jsErrors}\n\nPage summary:\n${summary}` }],
			details: { title, url },
		};
	}

	async function reloadAction() {
		const { page: p } = await deps.ensureBrowser();
		await p.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
		await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => { /* non-fatal */ });

		const title = await p.title();
		const url = p.url();
		const viewport = p.viewportSize();
		const vpText = viewport ? `${viewport.width}x${viewport.height}` : "unknown";
		const summary = await deps.postActionSummary(p);
		const jsErrors = deps.getRecentErrors(p.url());

		let screenshotContent: any[] = [];
		try {
			let buf = await p.screenshot({ type: "jpeg", quality: 80, scale: "css" });
			buf = await deps.constrainScreenshot(p, buf, "image/jpeg", 80);
			screenshotContent = [{ type: "image" as const, data: buf.toString("base64"), mimeType: "image/jpeg" }];
		} catch { /* non-fatal */ }

		return {
			content: [{ type: "text" as const, text: `Reloaded: ${url}\nTitle: ${title}\nViewport: ${vpText}${jsErrors}\n\nPage summary:\n${summary}` }, ...screenshotContent],
			details: { title, url, viewport: vpText },
		};
	}
}
