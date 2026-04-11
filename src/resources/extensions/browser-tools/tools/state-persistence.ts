import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

/**
 * State persistence — save/restore cookies, localStorage, sessionStorage.
 */

const STATE_DIR = ".gsd/browser-state";

export function registerStatePersistenceTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_state",
		label: "Browser State",
		description:
			"Save or restore browser state (cookies, localStorage, sessionStorage) to persist sessions across browser restarts. " +
			"State files written to .gsd/browser-state/ (should be gitignored).",
		parameters: Type.Object({
			action: Type.Union([
				Type.Literal("save"),
				Type.Literal("restore"),
			], { description: "'save' — persist current state, 'restore' — load previously saved state" }),
			name: Type.Optional(Type.String({ description: "State file name (default: 'default'). Used as filename stem." })),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			try {
				if (params.action === "save") {
					return await saveState(deps, params.name ?? "default");
				} else {
					return await restoreState(deps, params.name ?? "default");
				}
			} catch (err: any) {
				return {
					content: [{ type: "text" as const, text: `State '${params.action}' failed: ${err.message}` }],
					details: { error: err.message },
					isError: true,
				};
			}
		},
	});

	async function saveState(deps: ToolDeps, name: string) {
		const { context: ctx, page: p } = await deps.ensureBrowser();
		name = deps.sanitizeArtifactName(name, "default");
		const { mkdir, writeFile } = await import("node:fs/promises");
		const path = await import("node:path");
		const stateDir = path.resolve(process.cwd(), STATE_DIR);
		await mkdir(stateDir, { recursive: true });

		const storageState = await ctx.storageState();
		const sessionStorageData: Record<string, Record<string, string>> = {};
		try {
			const origin = new URL(p.url()).origin;
			const ssData = await p.evaluate(() => {
				const data: Record<string, string> = {};
				for (let i = 0; i < sessionStorage.length; i++) {
					const key = sessionStorage.key(i);
					if (key) data[key] = sessionStorage.getItem(key) ?? "";
				}
				return data;
			});
			if (Object.keys(ssData).length > 0) sessionStorageData[origin] = ssData;
		} catch { /* Page may not have a valid origin */ }

		const combined = { storageState, sessionStorage: sessionStorageData, savedAt: new Date().toISOString(), url: p.url() };
		const filePath = path.join(stateDir, `${name}.json`);
		await writeFile(filePath, JSON.stringify(combined, null, 2));

		const gitignorePath = path.resolve(process.cwd(), STATE_DIR, ".gitignore");
		await writeFile(gitignorePath, "*\n!.gitignore\n").catch(() => { /* best-effort */ });

		return {
			content: [{ type: "text" as const, text: `State saved: ${filePath}\nCookies: ${storageState.cookies?.length ?? 0}\nlocalStorage origins: ${storageState.origins?.length ?? 0}\nsessionStorage origins: ${Object.keys(sessionStorageData).length}` }],
			details: { path: filePath, cookieCount: storageState.cookies?.length ?? 0, localStorageOrigins: storageState.origins?.length ?? 0, sessionStorageOrigins: Object.keys(sessionStorageData).length },
		};
	}

	async function restoreState(deps: ToolDeps, name: string) {
		const { context: ctx, page: p } = await deps.ensureBrowser();
		name = deps.sanitizeArtifactName(name, "default");
		const { readFile } = await import("node:fs/promises");
		const path = await import("node:path");
		const filePath = path.join(process.cwd(), STATE_DIR, `${name}.json`);

		let raw: string;
		try { raw = await readFile(filePath, "utf-8"); } catch {
			return { content: [{ type: "text" as const, text: `State file not found: ${filePath}` }], details: { error: "file_not_found", path: filePath }, isError: true };
		}

		const combined = JSON.parse(raw);
		const storageState = combined.storageState;
		const sessionStorageData: Record<string, Record<string, string>> = combined.sessionStorage ?? {};

		let cookieCount = 0;
		if (storageState?.cookies?.length) {
			await ctx.addCookies(storageState.cookies);
			cookieCount = storageState.cookies.length;
		}

		let localStorageOrigins = 0;
		if (storageState?.origins?.length) {
			for (const origin of storageState.origins) {
				try {
					await p.evaluate((items: Array<{ name: string; value: string }>) => { for (const { name, value } of items) localStorage.setItem(name, value); }, origin.localStorage ?? []);
					localStorageOrigins++;
				} catch { /* Origin mismatch */ }
			}
		}

		let sessionStorageOrigins = 0;
		for (const [_origin, data] of Object.entries(sessionStorageData)) {
			try {
				await p.evaluate((items: Record<string, string>) => { for (const [key, value] of Object.entries(items)) sessionStorage.setItem(key, value); }, data);
				sessionStorageOrigins++;
			} catch { /* Origin mismatch */ }
		}

		return {
			content: [{ type: "text" as const, text: `State restored from: ${filePath}\nCookies: ${cookieCount}\nlocalStorage origins: ${localStorageOrigins}\nsessionStorage origins: ${sessionStorageOrigins}` }],
			details: { path: filePath, cookieCount, localStorageOrigins, sessionStorageOrigins, savedAt: combined.savedAt, savedUrl: combined.url },
		};
	}
}
