import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { SandboxConfig } from "./sandbox-policy.js";

export interface BwrapDetectionResult {
	available: boolean;
	path: string | null;
	version: string | null;
}

export function detectBwrap(): BwrapDetectionResult {
	const candidates = ["bwrap", "/usr/bin/bwrap", "/usr/local/bin/bwrap"];
	for (const candidate of candidates) {
		const result = spawnSync(candidate, ["--version"], { encoding: "utf-8" });
		if (!result.error && result.status === 0) {
			const version = (result.stdout || result.stderr || "").trim() || null;
			return { available: true, path: candidate, version };
		}
		if (candidate.startsWith("/") && existsSync(candidate)) {
			const fallback = spawnSync(candidate, ["--version"], { encoding: "utf-8" });
			if (!fallback.error && fallback.status === 0) {
				const version = (fallback.stdout || fallback.stderr || "").trim() || null;
				return { available: true, path: candidate, version };
			}
		}
	}
	return { available: false, path: null, version: null };
}

export function preflightBwrap(cwd: string, bwrapPath: string): boolean {
	const result = spawnSync(
		bwrapPath,
		[
			"--ro-bind",
			"/",
			"/",
			"--bind",
			resolve(cwd),
			resolve(cwd),
			"--proc",
			"/proc",
			"--dev",
			"/dev",
			"--unshare-pid",
			"--",
			"/bin/sh",
			"-c",
			"true",
		],
		{ cwd, stdio: "ignore" },
	);
	return result.status === 0;
}

export function buildBwrapArgs(
	command: string,
	cwd: string,
	shell: string,
	shellArgs: string[],
	config: SandboxConfig,
): string[] {
	const resolvedCwd = resolve(cwd);
	const writableRoots = [resolvedCwd, "/tmp", ...config.writableRoots.map((root) => resolve(root))];
	const args = [
		"--ro-bind",
		"/",
		"/",
		"--proc",
		"/proc",
		"--dev",
		"/dev",
		"--unshare-user",
		"--unshare-pid",
	];

	if (!config.networkEnabled) {
		args.push("--unshare-net");
	}

	for (const root of writableRoots) {
		args.push("--bind", root, root);
	}

	for (const root of writableRoots) {
		for (const subpath of config.readOnlySubpaths) {
			const protectedPath = resolve(root, subpath);
			if (existsSync(protectedPath)) {
				args.push("--ro-bind", protectedPath, protectedPath);
			}
		}
	}

	args.push("--", shell, ...shellArgs, command);
	return args;
}
