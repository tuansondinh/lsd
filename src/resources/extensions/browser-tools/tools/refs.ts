import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
	getSnapshotModeConfig,
	SNAPSHOT_MODES,
} from "../core.js";
import type { ToolDeps, RefNode } from "../state.js";
import {
	getActiveFrame,
	getCurrentRefMap,
	setCurrentRefMap,
	getRefVersion,
	setRefVersion,
	getRefMetadata,
	setRefMetadata,
} from "../state.js";

export function registerRefTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_ref",
		label: "Browser Ref",
		description:
			"Manage deterministic element references: snapshot interactive elements, inspect, click, fill, or hover by ref. " +
			"Use versioned refs (e.g. @v3:e2) from snapshot for reliable interaction.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("snapshot"),
				Type.Literal("get"),
				Type.Literal("click"),
				Type.Literal("fill"),
				Type.Literal("hover"),
			], { description: "'snapshot' — capture refs, 'get' — inspect ref, 'click'/'fill'/'hover' — interact by ref" }),
			ref: Type.Optional(Type.String({ description: "Versioned element ref, e.g. '@v3:e1'. Required for get/click/fill/hover." })),
			text: Type.Optional(Type.String({ description: "Text to fill (fill action only)." })),
			clearFirst: Type.Optional(Type.Boolean({ description: "Clear existing value first (fill action, default: false)." })),
			submit: Type.Optional(Type.Boolean({ description: "Press Enter after filling (fill action, default: false)." })),
			slowly: Type.Optional(Type.Boolean({ description: "Type character-by-character (fill action, default: false)." })),
			selector: Type.Optional(Type.String({ description: "CSS selector scope (snapshot action)." })),
			interactiveOnly: Type.Optional(Type.Boolean({ description: "Include only interactive elements (snapshot action, default: true)." })),
			limit: Type.Optional(Type.Number({ description: "Max elements in snapshot (default: 40)." })),
			mode: Type.Optional(Type.String({ description: "Snapshot mode: interactive, form, dialog, navigation, errors, headings, visible_only." })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				const action = params.action;

				if (action === "snapshot") {
					return await snapshotAction(params);
				} else if (action === "get") {
					return await getAction(params);
				} else if (action === "click") {
					return await clickAction(params);
				} else if (action === "fill") {
					return await fillAction(params);
				} else {
					return await hoverAction(params);
				}
			} catch (err: any) {
				const errorShot = await deps.captureErrorScreenshot(deps.getActivePageOrNull());
				const content: any[] = [{ type: "text" as const, text: `Ref '${params.action}' failed: ${err.message}` }];
				if (errorShot) content.push({ type: "image" as const, data: errorShot.data, mimeType: errorShot.mimeType });
				return { content, details: { error: err.message, ref: params.ref }, isError: true };
			}
		},
	});

	// ── validate ref helper ──
	function validateRef(ref: string | undefined): { parsedRef: any; node: RefNode; versionedRef: string } | { error: string; details: any } {
		if (!ref) return { error: "Ref 'ref' parameter is required.", details: { error: "missing_ref" } };
		const parsedRef = deps.parseRef(ref);
		const refMetadata = getRefMetadata();
		const refVersion = getRefVersion();
		if (parsedRef.version === null) {
			return { error: `Unversioned ref ${parsedRef.display} is ambiguous. Use a versioned ref (e.g. @v${refMetadata?.version ?? refVersion}:e1).`, details: { error: "ref_unversioned", ref: parsedRef.display } };
		}
		if (refMetadata && parsedRef.version !== refMetadata.version) {
			return { error: deps.staleRefGuidance(parsedRef.display, `version mismatch (have v${refMetadata.version})`), details: { error: "ref_stale", ref: parsedRef.display } };
		}
		const currentRefMap = getCurrentRefMap();
		const node = currentRefMap[parsedRef.key];
		if (!node) {
			return { error: deps.staleRefGuidance(parsedRef.display, "ref not found"), details: { error: "ref_not_found", ref: parsedRef.display } };
		}
		const versionedRef = deps.formatVersionedRef(refMetadata?.version ?? refVersion, node.ref);
		return { parsedRef, node, versionedRef };
	}

	// ── snapshot ──
	async function snapshotAction(params: any) {
		const { page: p } = await deps.ensureBrowser();
		const target = deps.getActiveTarget();
		const mode = params.mode;
		if (mode !== undefined) {
			const modeConfig = getSnapshotModeConfig(mode);
			if (!modeConfig) {
				return { content: [{ type: "text" as const, text: `Unknown snapshot mode: "${mode}". Valid: ${Object.keys(SNAPSHOT_MODES).join(", ")}` }], details: { error: "unknown_mode" }, isError: true };
			}
		}
		const interactiveOnly = params.interactiveOnly !== false;
		const limit = Math.max(1, Math.min(200, Math.floor(params.limit ?? 40)));
		const rawNodes = await deps.buildRefSnapshot(target, { selector: params.selector, interactiveOnly, limit, mode });
		const newVersion = getRefVersion() + 1;
		setRefVersion(newVersion);
		const nextMap: Record<string, RefNode> = {};
		for (let i = 0; i < rawNodes.length; i++) { nextMap[`e${i + 1}`] = { ref: `e${i + 1}`, ...rawNodes[i] }; }
		setCurrentRefMap(nextMap);
		const activeFrame = getActiveFrame();
		setRefMetadata({ url: p.url(), timestamp: Date.now(), selectorScope: params.selector, interactiveOnly, limit, version: newVersion, frameContext: activeFrame ? (activeFrame.name() || activeFrame.url()) : undefined, mode });
		if (rawNodes.length === 0) {
			return { content: [{ type: "text" as const, text: "No elements found (try interactiveOnly=false or wider scope)." }], details: { count: 0, version: newVersion, refs: {} } };
		}
		const versionedRefs: Record<string, RefNode> = {};
		const lines = Object.values(nextMap).map((node) => {
			const vr = deps.formatVersionedRef(newVersion, node.ref);
			versionedRefs[vr] = node;
			const parts: string[] = [vr, node.role || node.tag];
			if (node.name) parts.push(`"${node.name}"`);
			if (node.href) parts.push(`href="${node.href.slice(0, 80)}"`);
			if (!node.isVisible) parts.push("(hidden)");
			if (!node.isEnabled) parts.push("(disabled)");
			return parts.join(" ");
		});
		return {
			content: [{ type: "text" as const, text: `Ref snapshot v${newVersion} (${rawNodes.length} elements)\nURL: ${p.url()}\nScope: ${params.selector ?? "body"}\n${mode ? `Mode: ${mode}\n` : ""}Use versioned refs (e.g. @v${newVersion}:e1).\n\n${lines.join("\n")}` }],
			details: { count: rawNodes.length, version: newVersion, metadata: getRefMetadata(), refs: nextMap, versionedRefs },
		};
	}

	// ── get ──
	async function getAction(params: any) {
		const result = validateRef(params.ref);
		if ("error" in result) return { content: [{ type: "text" as const, text: result.error }], details: result.details, isError: true };
		const { node, versionedRef } = result;
		return {
			content: [{ type: "text" as const, text: `${versionedRef}: ${node.role || node.tag}${node.name ? ` "${node.name}"` : ""}\nVisible: ${node.isVisible}\nEnabled: ${node.isEnabled}\nPath: ${node.xpathOrPath}` }],
			details: { ref: versionedRef, node, metadata: getRefMetadata() },
		};
	}

	// ── click ──
	async function clickAction(params: any) {
		const result = validateRef(params.ref);
		if ("error" in result) return { content: [{ type: "text" as const, text: result.error }], details: result.details, isError: true };
		const { node, versionedRef } = result as any;
		const { page: p } = await deps.ensureBrowser();
		const target = deps.getActiveTarget();
		const refMetadata = getRefMetadata();
		if (refMetadata?.url && refMetadata.url !== p.url()) {
			return { content: [{ type: "text" as const, text: deps.staleRefGuidance(params.ref, "URL changed since snapshot") }], details: { error: "ref_stale" }, isError: true };
		}
		const resolved = await deps.resolveRefTarget(target, node);
		if (!resolved.ok) return { content: [{ type: "text" as const, text: deps.staleRefGuidance(params.ref, (resolved as any).reason) }], details: { error: "ref_stale" }, isError: true };

		const beforeState = await deps.captureCompactPageState(p, { includeBodyText: true, target });
		await target.locator(resolved.selector).first().click({ timeout: 8000 });
		await deps.settleAfterActionAdaptive(p);
		const afterState = await deps.captureCompactPageState(p, { includeBodyText: true, target });
		const summary = deps.formatCompactStateSummary(afterState);
		const jsErrors = deps.getRecentErrors(p.url());
		return {
			content: [{ type: "text" as const, text: `Clicked ${versionedRef} (${node.role || node.tag}${node.name ? ` "${node.name}"` : ""})${jsErrors}\n\nPage summary:\n${summary}` }],
			details: { ref: versionedRef, selector: resolved.selector, url: p.url() },
		};
	}

	// ── hover ──
	async function hoverAction(params: any) {
		const result = validateRef(params.ref);
		if ("error" in result) return { content: [{ type: "text" as const, text: result.error }], details: result.details, isError: true };
		const { node, versionedRef } = result as any;
		const { page: p } = await deps.ensureBrowser();
		const target = deps.getActiveTarget();
		const refMetadata = getRefMetadata();
		if (refMetadata?.url && refMetadata.url !== p.url()) {
			return { content: [{ type: "text" as const, text: deps.staleRefGuidance(params.ref, "URL changed since snapshot") }], details: { error: "ref_stale" }, isError: true };
		}
		const resolved = await deps.resolveRefTarget(target, node);
		if (!resolved.ok) return { content: [{ type: "text" as const, text: deps.staleRefGuidance(params.ref, (resolved as any).reason) }], details: { error: "ref_stale" }, isError: true };

		await target.locator(resolved.selector).first().hover({ timeout: 8000 });
		await deps.settleAfterActionAdaptive(p);
		const afterState = await deps.captureCompactPageState(p, { includeBodyText: false, target });
		const summary = deps.formatCompactStateSummary(afterState);
		const jsErrors = deps.getRecentErrors(p.url());
		return {
			content: [{ type: "text" as const, text: `Hovered ${versionedRef} (${node.role || node.tag}${node.name ? ` "${node.name}"` : ""})${jsErrors}\n\nPage summary:\n${summary}` }],
			details: { ref: versionedRef, selector: resolved.selector, url: p.url() },
		};
	}

	// ── fill ──
	async function fillAction(params: any) {
		const result = validateRef(params.ref);
		if ("error" in result) return { content: [{ type: "text" as const, text: result.error }], details: result.details, isError: true };
		const { node, versionedRef } = result as any;
		const { page: p } = await deps.ensureBrowser();
		const target = deps.getActiveTarget();
		const refMetadata = getRefMetadata();
		if (refMetadata?.url && refMetadata.url !== p.url()) {
			return { content: [{ type: "text" as const, text: deps.staleRefGuidance(params.ref, "URL changed since snapshot") }], details: { error: "ref_stale" }, isError: true };
		}
		const resolved = await deps.resolveRefTarget(target, node);
		if (!resolved.ok) return { content: [{ type: "text" as const, text: deps.staleRefGuidance(params.ref, (resolved as any).reason) }], details: { error: "ref_stale" }, isError: true };

		const locator = target.locator(resolved.selector).first();
		if (params.slowly) {
			await locator.click({ timeout: 8000 });
			if (params.clearFirst) { await p.keyboard.press("Control+A"); await p.keyboard.press("Delete"); }
			await p.keyboard.type(params.text ?? "");
		} else {
			if (params.clearFirst) await locator.fill("");
			await locator.fill(params.text ?? "", { timeout: 8000 });
		}
		if (params.submit) await p.keyboard.press("Enter");
		await deps.settleAfterActionAdaptive(p);

		const filledValue = await deps.readInputLikeValue(target, resolved.selector);
		const afterState = await deps.captureCompactPageState(p, { includeBodyText: true, target });
		const summary = deps.formatCompactStateSummary(afterState);
		const jsErrors = deps.getRecentErrors(p.url());
		return {
			content: [{ type: "text" as const, text: `Filled ${versionedRef} with "${params.text}" → value: "${filledValue}"${jsErrors}\n\nPage summary:\n${summary}` }],
			details: { ref: versionedRef, selector: resolved.selector, url: p.url(), filledValue },
		};
	}
}
