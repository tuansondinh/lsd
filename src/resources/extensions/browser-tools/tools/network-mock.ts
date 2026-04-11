import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

/**
 * Consolidated network interception tools — mock API responses, block URLs, manage routes.
 * Merged from: browser_mock_route, browser_block_urls, browser_clear_routes.
 */

interface ActiveRoute {
	id: number;
	pattern: string;
	type: "mock" | "block";
	status?: number;
	delay?: number;
	description: string;
}

let nextRouteId = 1;
const activeRoutes: ActiveRoute[] = [];
const routeCleanups: Map<number, () => Promise<void>> = new Map();

export function registerNetworkMockTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_network",
		label: "Browser Network",
		description:
			"Manage browser network interception: mock API responses, block URL patterns, or clear active routes. " +
			"Routes survive page navigation within the same context.",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("mock"),
				Type.Literal("block"),
				Type.Literal("clear"),
			], { description: "'mock' — intercept and respond, 'block' — abort matching requests, 'clear' — remove all active routes" }),
			url: Type.Optional(Type.String({
				description: "URL pattern to intercept (glob or exact). Required for mock/block.",
			})),
			status: Type.Optional(Type.Number({ description: "HTTP status code for mock response (default: 200)." })),
			body: Type.Optional(Type.String({ description: "Response body string for mock." })),
			contentType: Type.Optional(Type.String({ description: "Content-Type header for mock." })),
			headers: Type.Optional(Type.Record(Type.String(), Type.String(), {
				description: "Additional response headers for mock.",
			})),
			delay: Type.Optional(Type.Number({ description: "Delay in ms before sending mock response." })),
			patterns: Type.Optional(Type.Array(Type.String(), {
				description: "URL patterns to block (for block action). Glob syntax.",
			})),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				if (params.action === "mock") {
					return await handleMock(deps, params);
				} else if (params.action === "block") {
					return await handleBlock(deps, params);
				} else {
					return await handleClear(deps);
				}
			} catch (err: any) {
				return {
					content: [{ type: "text" as const, text: `Network action '${params.action}' failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});

	async function handleMock(deps: ToolDeps, params: any) {
		if (!params.url) {
			return { content: [{ type: "text" as const, text: "Mock requires a 'url' parameter." }], details: { error: "missing_url" }, isError: true };
		}
		const { page: p } = await deps.ensureBrowser();
		const routeId = nextRouteId++;
		const status = params.status ?? 200;
		const body = params.body ?? "";
		const delay = params.delay ?? 0;

		let contentType = params.contentType;
		if (!contentType) {
			try { JSON.parse(body); contentType = "application/json"; } catch { contentType = "text/plain"; }
		}

		const respHeaders: Record<string, string> = {
			"content-type": contentType,
			"access-control-allow-origin": "*",
			...(params.headers ?? {}),
		};

		const handler = async (route: any) => {
			if (delay > 0) await new Promise((r) => setTimeout(r, delay));
			await route.fulfill({ status, body, headers: respHeaders });
		};

		await p.route(params.url, handler);
		const cleanup = async () => { try { await p.unroute(params.url, handler); } catch { /* page may be closed */ } };

		const routeInfo: ActiveRoute = {
			id: routeId, pattern: params.url, type: "mock", status,
			delay: delay > 0 ? delay : undefined,
			description: `Mock ${params.url} → ${status}${delay > 0 ? ` (${delay}ms delay)` : ""}`,
		};
		activeRoutes.push(routeInfo);
		routeCleanups.set(routeId, cleanup);

		return {
			content: [{ type: "text" as const, text: `Route mocked: ${routeInfo.description}\nRoute ID: ${routeId}\nActive routes: ${activeRoutes.length}` }],
			details: { routeId, ...routeInfo, activeRouteCount: activeRoutes.length },
		};
	}

	async function handleBlock(deps: ToolDeps, params: any) {
		const patterns = params.patterns ?? (params.url ? [params.url] : []);
		if (patterns.length === 0) {
			return { content: [{ type: "text" as const, text: "Block requires 'patterns' or 'url' parameter." }], details: { error: "missing_patterns" }, isError: true };
		}
		const { page: p } = await deps.ensureBrowser();
		const results: ActiveRoute[] = [];

		for (const pattern of patterns) {
			const routeId = nextRouteId++;
			const handler = async (route: any) => { await route.abort("blockedbyclient"); };
			await p.route(pattern, handler);
			const cleanup = async () => { try { await p.unroute(pattern, handler); } catch { /* cleanup */ } };
			const routeInfo: ActiveRoute = { id: routeId, pattern, type: "block", description: `Block ${pattern}` };
			activeRoutes.push(routeInfo);
			routeCleanups.set(routeId, cleanup);
			results.push(routeInfo);
		}

		return {
			content: [{ type: "text" as const, text: `Blocked ${results.length} URL pattern(s):\n${results.map((r) => `  - ${r.description} (ID: ${r.id})`).join("\n")}\nActive routes: ${activeRoutes.length}` }],
			details: { blocked: results, activeRouteCount: activeRoutes.length },
		};
	}

	async function handleClear(_deps: ToolDeps) {
		await _deps.ensureBrowser();
		const count = activeRoutes.length;
		if (count === 0) {
			return { content: [{ type: "text" as const, text: "No active routes to clear." }], details: { cleared: 0 } };
		}
		const descriptions = activeRoutes.map((r) => r.description);
		for (const [, cleanup] of routeCleanups) await cleanup();
		activeRoutes.length = 0;
		routeCleanups.clear();
		return {
			content: [{ type: "text" as const, text: `Cleared ${count} route(s):\n${descriptions.map((d) => `  - ${d}`).join("\n")}` }],
			details: { cleared: count, routes: descriptions },
		};
	}
}
