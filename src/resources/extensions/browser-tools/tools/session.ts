import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { stat } from "node:fs/promises";
import path from "node:path";
import {
	formatTimelineEntries,
	buildFailureHypothesis,
	summarizeBrowserSession,
} from "../core.js";
import type { ToolDeps } from "../state.js";
import {
	ARTIFACT_ROOT,
	HAR_FILENAME,
	getPageRegistry,
	getActiveFrame,
	getConsoleLogs,
	getNetworkLogs,
	getDialogLogs,
	getActionTimeline,
	getActiveTraceSession,
	setActiveTraceSession,
	getHarState,
	setHarState,
	getSessionStartedAt,
	getSessionArtifactDir,
} from "../state.js";
import {
	getActiveFrameMetadata,
	ensureDir,
} from "../utils.js";

export function registerSessionTools(pi: ExtensionAPI, deps: ToolDeps): void {
	// -------------------------------------------------------------------------
	// browser_close
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_close",
		label: "Browser Close",
		description: "Close the browser and clean up all resources.",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			try {
				await deps.closeBrowser();
				return { content: [{ type: "text" as const, text: "Browser closed." }], details: {} };
			} catch (err: any) {
				return { content: [{ type: "text" as const, text: `Close failed: ${err.message}` }], details: { error: err.message }, isError: true };
			}
		},
	});

	// -------------------------------------------------------------------------
	// browser_trace — start, stop, export HAR
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_trace",
		label: "Browser Trace",
		description:
			"Manage Playwright tracing and HAR export: start/stop traces, export session HAR. " +
			"Traces capture screenshots, snapshots, and sources for debugging.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("start"),
				Type.Literal("stop"),
				Type.Literal("export_har"),
			], { description: "'start' — begin trace, 'stop' — end trace and save, 'export_har' — export network HAR" }),
			name: Type.Optional(Type.String({ description: "Name for the trace file or HAR export." })),
			title: Type.Optional(Type.String({ description: "Trace title (start action only)." })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				if (params.action === "start") {
					return await traceStart(params);
				} else if (params.action === "stop") {
					return await traceStop(params);
				} else {
					return await exportHar({ filename: params.name });
				}
			} catch (err: any) {
				return { content: [{ type: "text" as const, text: `Trace '${params.action}' failed: ${err.message}` }], details: { error: err.message, ...deps.getSessionArtifactMetadata() }, isError: true };
			}
		},
	});

	// -------------------------------------------------------------------------
	// browser_debug — timeline, session summary, debug bundle
	// -------------------------------------------------------------------------
	pi.registerTool({
		name: "browser_debug",
		label: "Browser Debug",
		description:
			"Browser session introspection: view action timeline, session summary, or write a full debug bundle to disk. " +
			"Use for debugging failing tests or complex browser interactions.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("timeline"),
				Type.Literal("summary"),
				Type.Literal("bundle"),
			], { description: "'timeline' — action history, 'summary' — session overview, 'bundle' — write full debug bundle to disk" }),
			writeToDisk: Type.Optional(Type.Boolean({ description: "Write timeline JSON to disk (timeline action)." })),
			filename: Type.Optional(Type.String({ description: "Filename for timeline/bundle output." })),
			selector: Type.Optional(Type.String({ description: "CSS selector scope for accessibility snapshot (bundle action)." })),
			name: Type.Optional(Type.String({ description: "Bundle name suffix (bundle action)." })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				if (params.action === "timeline") {
					return await timelineAction(params);
				} else if (params.action === "summary") {
					return await summaryAction();
				} else {
					return await bundleAction(params);
				}
			} catch (err: any) {
				return { content: [{ type: "text" as const, text: `Debug '${params.action}' failed: ${err.message}` }], details: { error: err.message, ...deps.getSessionArtifactMetadata() }, isError: true };
			}
		},
	});

	// ── trace helpers ──

	async function traceStart(params: { name?: string; title?: string }) {
		const { context: browserContext } = await deps.ensureBrowser();
		const activeTrace = getActiveTraceSession();
		if (activeTrace) {
			return { content: [{ type: "text" as const, text: `Trace already active: ${activeTrace.name}` }], details: { error: "trace_already_active", ...deps.getSessionArtifactMetadata() }, isError: true };
		}
		const startedAt = Date.now();
		const name = (params.name?.trim() || `trace-${deps.formatArtifactTimestamp(startedAt)}`).replace(/[^a-zA-Z0-9._-]+/g, "-");
		await browserContext.tracing.start({ screenshots: true, snapshots: true, sources: true, title: params.title ?? name });
		setActiveTraceSession({ startedAt, name, title: params.title ?? name });
		return {
			content: [{ type: "text" as const, text: `Trace started: ${name}\nSession dir: ${getSessionArtifactDir()}` }],
			details: { activeTraceSession: getActiveTraceSession(), ...deps.getSessionArtifactMetadata() },
		};
	}

	async function traceStop(params: { name?: string }) {
		const { context: browserContext } = await deps.ensureBrowser();
		const activeTrace = getActiveTraceSession();
		if (!activeTrace) {
			return { content: [{ type: "text" as const, text: "No active trace session." }], details: { error: "trace_not_active", ...deps.getSessionArtifactMetadata() }, isError: true };
		}
		const traceName = (params.name?.trim() || activeTrace.name).replace(/[^a-zA-Z0-9._-]+/g, "-");
		const tracePath = deps.buildSessionArtifactPath(`${traceName}.trace.zip`);
		await browserContext.tracing.stop({ path: tracePath });
		const fileStat = await stat(tracePath);
		setActiveTraceSession(null);
		return {
			content: [{ type: "text" as const, text: `Trace stopped: ${tracePath}` }],
			details: { path: tracePath, bytes: fileStat.size, elapsedMs: Date.now() - activeTrace.startedAt, traceName, ...deps.getSessionArtifactMetadata() },
		};
	}

	async function exportHar(params: { filename?: string }) {
		await deps.ensureBrowser();
		const harState = getHarState();
		if (!harState.enabled || !harState.configuredAtContextCreation || !harState.path) {
			return { content: [{ type: "text" as const, text: "HAR export unavailable: HAR recording was not enabled at context creation." }], details: { error: "har_not_enabled", ...deps.getSessionArtifactMetadata() }, isError: true };
		}
		const destinationName = (params.filename?.trim() || `export-${HAR_FILENAME}`).replace(/[^a-zA-Z0-9._-]+/g, "-");
		const destinationPath = deps.buildSessionArtifactPath(destinationName);
		const exportResult = harState.path === destinationPath
			? { path: harState.path, bytes: (await stat(harState.path)).size }
			: await deps.copyArtifactFile(harState.path, destinationPath);
		setHarState({ ...harState, exportCount: harState.exportCount + 1, lastExportedPath: exportResult.path, lastExportedAt: Date.now() });
		return {
			content: [{ type: "text" as const, text: `HAR exported: ${exportResult.path}` }],
			details: { path: exportResult.path, bytes: exportResult.bytes, ...deps.getSessionArtifactMetadata() },
		};
	}

	// ── debug helpers ──

	async function timelineAction(params: { writeToDisk?: boolean; filename?: string }) {
		await deps.ensureBrowser();
		const actionTimeline = getActionTimeline();
		const timeline = formatTimelineEntries(actionTimeline.entries, { limit: actionTimeline.limit, totalActions: actionTimeline.nextId - 1 });
		let artifact: { path: string; bytes: number } | null = null;
		if (params.writeToDisk) {
			const filename = (params.filename?.trim() || "timeline.json").replace(/[^a-zA-Z0-9._-]+/g, "-");
			artifact = await deps.writeArtifactFile(deps.buildSessionArtifactPath(filename), JSON.stringify(timeline, null, 2));
		}
		return {
			content: [{ type: "text" as const, text: artifact ? `${timeline.summary}\nArtifact: ${artifact.path}` : timeline.summary }],
			details: { ...timeline, artifact, ...deps.getSessionArtifactMetadata() },
		};
	}

	async function summaryAction() {
		await deps.ensureBrowser();
		const pages = await deps.getLivePagesSnapshot();
		const actionTimeline = getActionTimeline();
		const pageRegistry = getPageRegistry();
		const consoleLogs = getConsoleLogs();
		const networkLogs = getNetworkLogs();
		const dialogLogs = getDialogLogs();
		const baseSummary = summarizeBrowserSession({
			timeline: actionTimeline, totalActions: actionTimeline.nextId - 1, pages,
			activePageId: pageRegistry.activePageId, activeFrame: getActiveFrameMetadata(),
			consoleEntries: consoleLogs, networkEntries: networkLogs, dialogEntries: dialogLogs,
			consoleLimit: 1000, networkLimit: 1000, dialogLimit: 1000,
			sessionStartedAt: getSessionStartedAt(), now: Date.now(),
		});
		const failureHypothesis = buildFailureHypothesis({ timeline: actionTimeline, consoleEntries: consoleLogs, networkEntries: networkLogs, dialogEntries: dialogLogs });
		const activeTrace = getActiveTraceSession();
		const traceState = activeTrace ? { status: "active", ...activeTrace } : { status: "inactive", lastTracePath: getSessionArtifactDir() ? deps.buildSessionArtifactPath("*.trace.zip") : null };
		const harState = getHarState();
		return {
			content: [{ type: "text" as const, text: `${baseSummary.summary}\nFailure hypothesis: ${failureHypothesis}` }],
			details: { ...baseSummary, failureHypothesis, trace: traceState, har: { enabled: harState.enabled, exportCount: harState.exportCount }, ...deps.getSessionArtifactMetadata() },
		};
	}

	async function bundleAction(params: { selector?: string; name?: string }) {
		const { page: p } = await deps.ensureBrowser();
		const startedAt = Date.now();
		const sessionDir = await deps.ensureSessionArtifactDir();
		const bundleDir = path.join(ARTIFACT_ROOT, `${deps.formatArtifactTimestamp(startedAt)}-${deps.sanitizeArtifactName(params.name ?? "debug-bundle", "debug-bundle")}`);
		await ensureDir(bundleDir);
		const pages = await deps.getLivePagesSnapshot();
		const actionTimeline = getActionTimeline();
		const pageRegistry = getPageRegistry();
		const consoleLogs = getConsoleLogs();
		const networkLogs = getNetworkLogs();
		const dialogLogs = getDialogLogs();
		const timeline = formatTimelineEntries(actionTimeline.entries, { limit: actionTimeline.limit, totalActions: actionTimeline.nextId - 1 });
		const sessionSummary = summarizeBrowserSession({
			timeline: actionTimeline, totalActions: actionTimeline.nextId - 1, pages,
			activePageId: pageRegistry.activePageId, activeFrame: getActiveFrameMetadata(),
			consoleEntries: consoleLogs, networkEntries: networkLogs, dialogEntries: dialogLogs,
			consoleLimit: 1000, networkLimit: 1000, dialogLimit: 1000,
			sessionStartedAt: getSessionStartedAt(), now: Date.now(),
		});
		const failureHypothesis = buildFailureHypothesis({ timeline: actionTimeline, consoleEntries: consoleLogs, networkEntries: networkLogs, dialogEntries: dialogLogs });
		const accessibility = await deps.captureAccessibilityMarkdown(params.selector);
		const screenshotPath = path.join(bundleDir, "screenshot.jpg");
		await p.screenshot({ path: screenshotPath, type: "jpeg", quality: 80, fullPage: false });
		const screenshotStat = await stat(screenshotPath);
		const artifacts = {
			screenshot: { path: screenshotPath, bytes: screenshotStat.size },
			console: await deps.writeArtifactFile(path.join(bundleDir, "console.json"), JSON.stringify(consoleLogs, null, 2)),
			network: await deps.writeArtifactFile(path.join(bundleDir, "network.json"), JSON.stringify(networkLogs, null, 2)),
			dialog: await deps.writeArtifactFile(path.join(bundleDir, "dialog.json"), JSON.stringify(dialogLogs, null, 2)),
			timeline: await deps.writeArtifactFile(path.join(bundleDir, "timeline.json"), JSON.stringify(timeline, null, 2)),
			summary: await deps.writeArtifactFile(path.join(bundleDir, "summary.json"), JSON.stringify({ ...sessionSummary, failureHypothesis, trace: getActiveTraceSession(), sessionArtifactDir: sessionDir }, null, 2)),
			pages: await deps.writeArtifactFile(path.join(bundleDir, "pages.json"), JSON.stringify(pages, null, 2)),
			accessibility: await deps.writeArtifactFile(path.join(bundleDir, "accessibility.md"), accessibility.snapshot),
		};
		return {
			content: [{ type: "text" as const, text: `Debug bundle written: ${bundleDir}\n${sessionSummary.summary}\nFailure hypothesis: ${failureHypothesis}` }],
			details: {
				bundleDir, artifacts, accessibilityScope: accessibility.scope, accessibilitySource: accessibility.source,
				counts: { console: consoleLogs.length, network: networkLogs.length, dialog: dialogLogs.length, actions: timeline.retained, pages: pages.length },
				elapsedMs: Date.now() - startedAt, summary: sessionSummary, failureHypothesis, ...deps.getSessionArtifactMetadata(),
			},
		};
	}
}
